#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <DHT.h>

#define WIFI_SSID     "Wokwi-GUEST"
#define WIFI_PASSWORD ""
#define MQTT_BROKER   "3d45e6809f7a47f0983691192e9b674b.s1.eu.hivemq.cloud"
#define MQTT_PORT     8883
#define MQTT_CLIENT   "ESP32_AgriShare"
#define MQTT_USER     "Wassmi"
#define MQTT_PASSWORD "Wassmi123"

#define TOPIC_DHT     "agrishare/sensors/dht"
#define TOPIC_SOIL    "agrishare/sensors/soil"
#define TOPIC_LDR     "agrishare/sensors/ldr"
#define TOPIC_NPK     "agrishare/sensors/npk"
#define TOPIC_WATER   "agrishare/sensors/water"
#define TOPIC_FAN     "agrishare/actuators/fan"
#define TOPIC_CO2     "agrishare/sensors/co2"
#define TOPIC_ALL     "agrishare/sensors/all"

#define DHT_PIN        4
#define DHT_TYPE       DHT22
#define SOIL_PIN       34
#define LDR_PIN        35
#define CO2_PIN        32
#define NPK_RX_PIN     16
#define NPK_TX_PIN     17
#define KY_CLK         18
#define KY_DT          19
#define KY_SW          21

#define STEPPER_STEP_PIN  26
#define STEPPER_DIR_PIN   27
#define STEPPER_EN_PIN    14

#define TEMP_THRESHOLD        28.0
#define STEPPER_STEP_DELAY_US 800
#define STEPPER_PULSE_US      2     

#define NPK_CMD_N      0x01
#define NPK_CMD_P      0x03
#define NPK_CMD_K      0x05
#define NPK_TIMEOUT_MS 80          

#define INTERVAL_DHT          2000
#define INTERVAL_ADC           500
#define INTERVAL_NPK           3000
#define INTERVAL_WATER         1000
#define INTERVAL_ALL            5000
#define INTERVAL_FAN_PUBLISH    2000
#define MQTT_RETRY_MS           3000

DHT              dht(DHT_PIN, DHT_TYPE);
HardwareSerial   npkSerial(2);
WiFiClientSecure wifiClient;
PubSubClient     mqttClient(wifiClient);

unsigned long tDHT      = 0;
unsigned long tADC      = 0;
unsigned long tNPK      = 0;
unsigned long tWater    = 0;
unsigned long tAll      = 0;
unsigned long tMqtt     = 0;
unsigned long tFanPub   = 0;
unsigned long tStepperLastStep = 0;

bool stepperPulseHigh = false;
unsigned long tStepperPulseStart = 0;

volatile int pulseCount = 0;
float        flowRate   = 0.0;
float        totalVolume = 0.0;
int          lastSW     = HIGH;

void IRAM_ATTR onEncoderChange() {
  if (digitalRead(KY_DT) == HIGH) pulseCount++;
  else if (pulseCount > 0)        pulseCount--;
}

float   cachedTemp = -1;
float   cachedHum  = -1;
int     cachedSoil = -100;
int     cachedLdr  = -100;
int     cachedCo2  = -100;
uint8_t cachedN    = 0;
uint8_t cachedP    = 0;
uint8_t cachedK    = 0;

bool fanActive = false;

static char buf[256];

void    connectWiFi();
void    maintainMQTT();
uint8_t npkRequest(uint8_t cmd);
void    publishMQTT(const char* topic, const char* payload);
void    updateFan();
void    stepperTick(); 

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== AgriShare ===");

  dht.begin();
  npkSerial.begin(15200, SERIAL_8N1, NPK_RX_PIN, NPK_TX_PIN);

  pinMode(KY_CLK, INPUT_PULLUP);
  pinMode(KY_DT,  INPUT_PULLUP);
  pinMode(KY_SW,  INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(KY_CLK), onEncoderChange, FALLING);

  pinMode(STEPPER_STEP_PIN, OUTPUT);
  pinMode(STEPPER_DIR_PIN,  OUTPUT);
  pinMode(STEPPER_EN_PIN,   OUTPUT);
  digitalWrite(STEPPER_EN_PIN, HIGH);
  digitalWrite(STEPPER_DIR_PIN, HIGH);
  digitalWrite(STEPPER_STEP_PIN, LOW);

  connectWiFi();
  wifiClient.setInsecure();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setKeepAlive(120);
  mqttClient.setSocketTimeout(5);
  maintainMQTT();

  Serial.println("Ready.\n");
}

void loop() {
  maintainMQTT();

  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  unsigned long now = millis();

  if (now - tDHT >= INTERVAL_DHT) {
    tDHT = now;
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    if (!isnan(h) && !isnan(t)) {
      cachedHum  = h;
      cachedTemp = t;
      sprintf(buf, "{\"temperature\":%.1f,\"humidity\":%.1f}",
              cachedTemp, cachedHum);
      publishMQTT(TOPIC_DHT, buf);
      Serial.printf("  [DHT]  T:%.1fC  H:%.1f%%\n", cachedTemp, cachedHum);
    }
  }

  // ── Soil + LDR ─────────────────────────
  if (now - tADC >= INTERVAL_ADC) {
    tADC = now;

    int soil    = analogRead(SOIL_PIN);
    int ldr     = analogRead(LDR_PIN);
    int co2     = analogRead(CO2_PIN);

    if (abs(soil - cachedSoil) > 40) {
      cachedSoil = soil;
      int soilPct = map(soil, 4095, 0, 0, 100);
      sprintf(buf, "{\"raw\":%d,\"percent\":%d}", soil, soilPct);
      publishMQTT(TOPIC_SOIL, buf);
      Serial.printf("  [SOIL] %d%%\n", soilPct);
    }

    if (abs(ldr - cachedLdr) > 10) {
      cachedLdr = ldr;
      int ldrPct = map(ldr, 0, 4095, 0, 100);
      sprintf(buf, "{\"raw\":%d,\"percent\":%d}", ldr, ldrPct);
      publishMQTT(TOPIC_LDR, buf);
      Serial.printf("  [LDR]  %d%%\n", ldrPct);
    }

    if (abs(co2 - cachedCo2) > 10) {
      cachedCo2 = co2;
      int co2Ppm = map(co2, 0, 4095, 400, 2000);
      sprintf(buf, "{\"raw\":%d,\"ppm\":%d}", co2, co2Ppm);
      publishMQTT(TOPIC_CO2, buf);
      Serial.printf("  [CO2]  %d ppm\n", co2Ppm);
    }
  }

  // ── NPK ────────────────────────────────
  if (now - tNPK >= INTERVAL_NPK) {
    tNPK = now;
    uint8_t n = npkRequest(NPK_CMD_N);
    uint8_t p = npkRequest(NPK_CMD_P);
    uint8_t k = npkRequest(NPK_CMD_K);
    if (n != 0xFF && p != 0xFF && k != 0xFF) {
      cachedN = n; cachedP = p; cachedK = k;
      sprintf(buf, "{\"N\":%d,\"P\":%d,\"K\":%d}", n, p, k);
      publishMQTT(TOPIC_NPK, buf);
      Serial.printf("  [NPK]  N:%d P:%d K:%d mg/kg\n", n, p, k);
    }
  }

  // ── Water flow ─────────────────────────
  if (now - tWater >= INTERVAL_WATER) {
    tWater = now;

    noInterrupts();
    int pulses = pulseCount;
    pulseCount = 0;
    interrupts();

    flowRate     = pulses / 7.5;
    totalVolume += flowRate / 60.0;

    sprintf(buf, "{\"flow_rate\":%.2f,\"total_volume\":%.2f}",
            flowRate, totalVolume);
    publishMQTT(TOPIC_WATER, buf);

    int sw = digitalRead(KY_SW);
    if (sw == LOW && lastSW == HIGH) {
      totalVolume = 0.0;
      Serial.println("  [WATER] Volume reset!");
    }
    lastSW = sw;
  }

  // ── Fan control ────────────────────────
  updateFan();
  stepperTick();

  // ── Fan status publish ─────────────────
  if (now - tFanPub >= INTERVAL_FAN_PUBLISH) {
    tFanPub = now;
    sprintf(buf, "{\"active\":%s,\"temperature\":%.1f,\"threshold\":%.1f}",
            fanActive ? "true" : "false", cachedTemp, TEMP_THRESHOLD);
    publishMQTT(TOPIC_FAN, buf);
    Serial.printf("  [FAN]  %s (T:%.1fC / seuil:%.1fC)\n",
                  fanActive ? "ON" : "OFF", cachedTemp, TEMP_THRESHOLD);
  }

  // ── Master payload ─────────────────────
  if (now - tAll >= INTERVAL_ALL) {
    tAll = now;
    sprintf(buf,
      "{\"temperature\":%.1f,\"humidity_air\":%.1f,"
      "\"humidity_soil\":%d,\"luminosity\":%d,"
      "\"nitrogen\":%d,\"phosphorus\":%d,\"potassium\":%d,"
      "\"flow_rate\":%.2f,\"total_volume\":%.2f,"
      "\"fan_active\":%s,"
      "\"co2\":%d,"
      "\"timestamp\":%lu}",
      cachedTemp, cachedHum,
      map(cachedSoil, 4095, 0, 0, 100),
      map(cachedLdr,  0, 4095, 0, 100),
      cachedN, cachedP, cachedK,
      flowRate, totalVolume,
      fanActive ? "true" : "false",
      map(cachedCo2, 0, 4095, 400, 2000),
      millis());
    publishMQTT(TOPIC_ALL, buf);
    Serial.println("  [ALL]  Master payload sent");
  }
}

void updateFan() {
  bool shouldRun = (cachedTemp >= TEMP_THRESHOLD);

  if (shouldRun && !fanActive) {
    fanActive = true;
    digitalWrite(STEPPER_EN_PIN, LOW);
    Serial.println("  [FAN]  >>> ACTIVATED");
  }
  else if (!shouldRun && fanActive) {
    fanActive = false;
    digitalWrite(STEPPER_EN_PIN, HIGH);
    Serial.println("  [FAN]  <<< STOPPED");
  }
}

void stepperTick() {
  if (!fanActive) return;

  unsigned long us = micros();

  if (!stepperPulseHigh) {
    // Time to start a new pulse?
    if (us - tStepperLastStep >= STEPPER_STEP_DELAY_US) {
      digitalWrite(STEPPER_STEP_PIN, HIGH);
      stepperPulseHigh   = true;
      tStepperPulseStart = us;
      tStepperLastStep   = us;
    }
  } else {
    // Pulse currently HIGH — end it after STEPPER_PULSE_US
    if (us - tStepperPulseStart >= STEPPER_PULSE_US) {
      digitalWrite(STEPPER_STEP_PIN, LOW);
      stepperPulseHigh = false;
    }
  }
}

void publishMQTT(const char* topic, const char* payload) {
  if (!mqttClient.connected()) return;
  mqttClient.publish(topic, payload);
}

uint8_t npkRequest(uint8_t cmd) {
  while (npkSerial.available()) npkSerial.read();
  npkSerial.write(cmd);
  npkSerial.flush();
  unsigned long t = millis();
  while (!npkSerial.available()) {
    if (millis() - t > NPK_TIMEOUT_MS) return 0xFF;
  }
  return (uint8_t)npkSerial.read();
}

void maintainMQTT() {
  if (mqttClient.connected()) return;
  unsigned long now = millis();
  if (now - tMqtt < MQTT_RETRY_MS) return;
  tMqtt = now;
  Serial.print("MQTT reconnect... ");
  if (mqttClient.connect(MQTT_CLIENT, MQTT_USER, MQTT_PASSWORD))
    Serial.println("OK");
  else
    Serial.printf("failed (state=%d)\n", mqttClient.state());
}

void connectWiFi() {
  Serial.printf("WiFi -> %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\nIP: %s\n", WiFi.localIP().toString().c_str());
}
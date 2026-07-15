// Wokwi Custom Chip for CO₂ Sensor Simulation
// For more information: https://docs.wokwi.com/guides/custom-chips
//
// SPDX-License-Identifier: MIT
// Copyright (C) 2022 Uri Shaked

#include "wokwi-api.h"
#include <stdlib.h>

typedef struct {
  pin_t pin_out;       // Analog output pin (A0)
  uint32_t co2_attr;   // Attribute handle for the CO₂ slider
} chip_state_t;

static void chip_timer_event(void *user_data);

void chip_init(void) {
  // memory for our custom chip state
  chip_state_t *chip = (chip_state_t *)malloc(sizeof(chip_state_t));

  // Initialize pin A0 as an analog output
  chip->pin_out = pin_init("A0", ANALOG);

  // Create a slider attribute named "CarbonDioxide" (default = 0.0)
  chip->co2_attr = attr_init_float("CarbonDioxide", 0.0);

  // Set up a repeating timer to update the analog output every 100 ms
  const timer_config_t timer_config = {
    .callback = chip_timer_event,
    .user_data = chip,
  };
  timer_t timer_id = timer_init(&timer_config);
  timer_start(timer_id, 100, true);
}

void chip_timer_event(void *user_data) {
  chip_state_t *chip = (chip_state_t *)user_data;

  // Read the slider value
  float slider_value = attr_read_float(chip->co2_attr);

  // Convert slider value to a voltage in the range 0..3.3 V
  float voltage = (slider_value / 800.0f) * 3.3f;

  // Output that voltage on A0
  pin_dac_write(chip->pin_out, voltage);
}

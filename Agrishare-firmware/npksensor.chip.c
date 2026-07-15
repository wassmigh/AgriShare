#include "wokwi-api.h"
#include <stdio.h>
#include <stdlib.h>

typedef struct {
  // TODO: Put your chip variables here
  uint32_t nit,phos,pot;
  uart_dev_t uart0;
} chip_state_t;

static void on_uart_rx_data(void *user_data, uint8_t byte);
static void on_uart_write_done(void *user_data);

void chip_init() {
  chip_state_t *chip = malloc(sizeof(chip_state_t));
  chip->nit = attr_init("N", 24);
  chip->phos = attr_init("P", 24);
  chip->pot = attr_init("K", 24);
  //
  const uart_config_t uart_config = {
    .tx = pin_init("TX", INPUT_PULLUP),
    .rx = pin_init("RX", INPUT),
    .baud_rate = 15200,
    .rx_data = on_uart_rx_data,
    .write_done = on_uart_write_done,
    .user_data = chip,
  };
  chip->uart0 = uart_init(&uart_config);
  // TODO: Initialize the chip, set up IO pins, create timers, etc.
  //printf("%d",attr_read(chip->pot));
  printf("NPK sensor initialized");
}

 uint8_t npk_value(uint8_t byte, chip_state_t* chip) 
 {
  uint8_t retval;
  switch (byte)
  {
    case 1: // nitrogen value requested
    retval = attr_read(chip->nit);
    printf("Nitrogen value requested: ");
    break;
    case 3: // phosphorus requested
    retval = attr_read(chip->phos);
    printf("Phosphorous value requested: ");
    break;
    case 5: // potassium requested
    retval = attr_read(chip->pot);
    printf("Potassium value requested: ");
    break;
    default: // erronous incoming data
    retval=0xff;
  }
  return retval;
 }
 static void on_uart_rx_data(void *user_data, uint8_t byte) {
  chip_state_t *chip = (chip_state_t*)user_data;
  printf("Incoming UART data: %d\n", byte);
  uint8_t data_out = npk_value(byte, chip);
  if (data_out != 0xff)
  {
    uart_write(chip->uart0, &data_out, sizeof(data_out));
    printf("%d\n",data_out);
  }
}

static void on_uart_write_done(void *user_data) {
  chip_state_t *chip = (chip_state_t*)user_data;
  printf("UART Write done\n");
}

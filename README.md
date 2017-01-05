# Lifx nodes for Node-Red
An solution to control Lifx lights using Node-Red, uses [node-lifx library](https://github.com/MariusRumpf/node-lifx) for communicating with the lights.

This module provides input and output nodes for communicating with Lifx lights, the input node accepts multiple color format and automatically converts the values to the right format. 

### Features
* Convert input arguments to light specific arguments
* Trigger events for light changes
* Self syncing, uses background polling to detect external changes to light
* Displays current state for light in Node-Red ui

### Input node
The light is controlled by sending message with an payload containing one or more of the following properties to the light

| Property | Value |
|---|---|
| `on` | Set light state (true/false)|
| `red`, `green` and/or `blue` | Set one or more color changel for light (0-255)|
| `hex` | Set color (#f49242) |
| `hue` | Set color hue (0-360) |
| `sat` | Set color saturation (0-100) | 
| `bri` | Set light brightness (0-100%) |
| `cr`, `mired` or `mirek` | Set Mired color temperature (153 - 500) |
| `kelvin` | Set kelvin color temperature (2200-6500) |
| `duration` | Transition time (ms) |


Example: Sending the following to the light will turn it on and dimm it upp to 77% over 10 seconds

```json
{
  "payload": {
    "on": true, 
    "bri": 77,
    "duration": 10000
  }
}
```

### Output node

Example output from change event 
```json
{ 
  "address": "192.168.1.107",
  "label": "Lifx Black", 
  "payload": {
    "on": true, 
    "reachable": true, 
    "mode": "Brightness", 
    "bri": 69, 
    "hsv": [ 0, 0, 69 ], 
    "rgb": [ 175, 175, 175 ], 
    "hex": "B0B0B0", 
    "color": "darkgray", 
    "kelvin": 2500, 
    "mired": 400 
  },
  ...
}
```

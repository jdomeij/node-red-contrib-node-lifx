# Lifx nodes for Node-Red
An solution to control Lifx lights using Node-Red, uses [node-lifx library](https://github.com/MariusRumpf/node-lifx) for communicating with the lights.

This module provides input and output nodes for communicating with Lifx lights, the input node accepts multiple color format and automatically converts the values to the right format. 

### Features
* Convert input arguments to light specific arguments
* Trigger events for light changes
* Self syncing, uses background polling to detect external changes to light
* Displays current state for light in Node-Red ui

### Input node
The light is controlled by sending message with an payload containing the new state

Simplified control by sending the following values as payload

| Value | Info |
|---|---|
| `'on'` or `true` | Turn light on |
| `'off'`or `false` | Turn light off |
| numeric value | Turn light on and set brightness (0-100%) |

More advanced way to control the light is to send an object payload with one or more of the following properties set

| Property | Info |
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

Example: Sending the following to the light will turn it on and dim it upp to 77% over 10 seconds

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
  "id": "d073d5015103", 
  "address": "192.168.1.107", 
  "label": "Lifx Black", 
  "payload": { 
    "on": true, 
    "reachable": true, 
    "bri": 57, 
    "hsv": [ 169, 37, 57 ], 
    "rgb": [ 91, 145, 135 ], 
    "hex": "5C9187", 
    "color": "cadetblue", 
    "kelvin": 2513, 
    "mired": 397
  }, 
  "capability": [ "brightness", "color", "temperature" ], 
  ...
}
```

"use strict";

//var nodeLifx = require('node-lifx');
var _        = require('lodash');
var Enum     = require('enum');

var inherits      = require('util').inherits;  
var EventEmitter  = require('events').EventEmitter;

var colorConvert   = require('color-convert');
var colorTemp      = require('color-temp');
var colorSpace     = require('color-space');

// Color mode enums
const ColorMode = new Enum({
  BRIGHTNESS:   'Brightness',
  COLOR:        'Color',
  TEMPERATURE:  'Temperature',
});


/**
 * Converts/Filters Lifx info to internal state
 * @param  {object} lifxInfo Lifx info
 * @return {object} Internal state
 */
function convertLifxState(lifxInfo) {
  const hueStateProperties = {
    hue: true,
    saturation: 'sat',
    brightness: 'bri',
    kelvin: true,
  };

  var state = _.reduce(lifxInfo.color, (coll, value, key) => {
    if (!hueStateProperties.hasOwnProperty(key))
      return coll;
    
    var stateItem = hueStateProperties[key];

    if (stateItem === true)
      coll[key] = value;
    if (typeof stateItem === 'string')
      coll[stateItem] = value;
    return coll;
  }, {});

  // Inject on status
  state.on = (lifxInfo.power !== 0);

  return state;
}


/**
 * Class
 * @param {LifxLight} lifxLight  Light from node-lifx
 * @param {object}    config     Configuration
 * @param {number}    config.pollInterval Poll interval  
 */
function LightItem(lifxLight, config) {
  this.uniqueid = lifxLight.id;
  this.lifx     = lifxLight;
  this.modified = 0;

  this.pollTimer = null;

  this.info = {
    address: lifxLight.address,
    label:   lifxLight.label,
    reachable: (lifxLight.status === 'on'),
  }

  this.state = {
    on:        false,
    mode:      ColorMode.BRIGHTNESS,
    bri:       0,
  }

  this.config = _.merge({}, config);
  if (this.config.pollInterval !== 'number' || this.config.pollInterval < 5000)
    this.config.pollInterval = 5000;

  this.pollTimer = setInterval(this.pollChanges.bind(this), this.config.pollInterval);
  this.pollChanges();

  EventEmitter.call(this);
}

inherits(LightItem, EventEmitter);


/**
 * Stop the light
 */
LightItem.prototype.stop = function stop() {
  var self = this;
  if (self.pollTimer)
    clearInterval(self.pollTimer);
  self.pollTimer = null;
}


/**
 * Check and update light information
 * @param  {object} info Lifx light information
 */
LightItem.prototype.updateInfo = function updateInfo(info) {
  var self = this;

  // Ignore our own changes
  if (this.modified >= process.uptime())
    return;

  var lifxState = convertLifxState(info);
  var isUpdated = false;

  // TODO
  lifxState.mode = this.state.mode;

  // Determine if state is updated
  isUpdated = this.state.on !== lifxState.on || isUpdated;

  // Only check the rest of values if light is on
  if (lifxState.on) {
    isUpdated = !_.isEqual(this.state, lifxState);
    if (isUpdated)
      _.merge(this.state, lifxState);
  }
  else {
    // Update state variables
    this.state.on = lifxState.on;
  }

  // Copy label
  self.info.label = info.label;

  // Values/state has been updated
  if (isUpdated)
    this.emit('change');
}


/**
 * Poll light for changes
 */
LightItem.prototype.pollChanges = function pollChanges() {
  var self = this;

  this.lifx.getState((err, info) => {
    // Ignore, no response
    if (err) {
      return;
    }
    self.updateInfo(info);
  });
}


/**
 * Check if we have new color and calculate updated properties
 * @param  {object} input  Input arguments
 * @param  {object} output New state arguments
 * @return {bool}          Is color updated
 */
LightItem.prototype.updateColorRGB = function updateColorRGB(input, output) {

  var changed = false;  
  var hsv = [this.state.hue||0, this.state.sat||0, this.state.bri||0];

  if (input.hue !== undefined) {
    changed = true;
    hsv[0] = input.hue;

  }
  else if (input.red !== undefined ||
           input.green !== undefined ||
           input.blue !== undefined)
  {
    changed = true;
    let rgb = colorSpace.hsv.rgb(hsv);
    if (typeof input.red === 'number')
      rgb[0] = input.red;
    if (typeof input.green === 'number')
      rgb[1] = input.green;
    if (typeof input.blue === 'number')
      rgb[2] = input.blue;

    rgb[0] = Math.max(0, rgb[0]);
    rgb[1] = Math.max(0, rgb[1]);
    rgb[2] = Math.max(0, rgb[2]);

    rgb[0] = Math.min(255, rgb[0]);
    rgb[1] = Math.min(255, rgb[1]);
    rgb[2] = Math.min(255, rgb[2]);

    hsv = colorSpace.rgb.hsv(rgb);
  }
  else if (input.hex !== undefined && /^#?[0-9a-fA-F]{6}$/.test(input.hex)) {
    changed = true;
    hsv = colorSpace.rgb.hsv(colorConvert.hex.rgb(input.hex));
  }

  if (input.sat !== undefined) {
    changed = true;
    hsv[1] = input.sat;
  }
  else if (input.saturation !== undefined) {
    changed = true;
    hsv[1] = input.saturation;
  }

  // No change
  if (!changed)
    return false;

  // Don't trigger change on brightness
  if (input.bri !== undefined) {
    hsv[2] = input.bri;
  }
  else if (input.brightness !== undefined) {
    hsv[2] = input.brightness;
  }

  hsv[0] = Math.max(0, hsv[0]);
  hsv[1] = Math.max(0, hsv[1]);
  hsv[2] = Math.max(0, hsv[2]);

  hsv[0] = Math.min(359, hsv[0]);
  hsv[1] = Math.min(100, hsv[1]);
  hsv[2] = Math.min(100, hsv[2]);


  output.mode = ColorMode.COLOR;
  output.hue = hsv[0];
  output.sat = hsv[1];
  output.bri = hsv[2];

  return true;
}


/**
 * Check if we have new temperature color and calculate updated properties
 * @param  {object} input  Input arguments
 * @param  {object} output New state arguments
 * @return {bool}          Is temperature color updated
 */
LightItem.prototype.updateColorTemp = function updateColorTemp(input, output) {
  var changed = false;
  var kelvin  = this.state.kelvin;
  var bri     = this.state.bri;

  // Mired/Mirek color temperature
  if (input.ct !== undefined) {
    changed = true;
    kelvin = 1000000 / input.ct;
  }

  // Kelvin color temperature
  else if (input.kelvin !== undefined) {
    changed = true;
    kelvin = input.kelvin;
  }

  if (input.bri !== undefined) {
    bri = input.bri;
  }
  else if (input.brightness !== undefined) {
    bri = input.brightness;
  }

  // No change
  if (!changed)
    return false;

  var rgb = colorTemp.temp2rgb(kelvin);
  var hsv = colorSpace.rgb.hsv(rgb);

  output.mode = ColorMode.TEMPERATURE;
  output.kelvin = kelvin;
  output.hue = hsv[0];
  output.sat = 1;
  output.bri = bri;
  output.kelvin = kelvin;

  return true;
}


/**
 * Check if we have new brightness value and calculate updated properties
 * @param  {object} input  Input arguments
 * @param  {object} output New state arguments
 * @return {bool}          Is brightness updated
 */
LightItem.prototype.updateColorBri = function updateColorBri(input, output) {
  var bri = this.state.bri;
  var changed = false;
  
  if (input.bri !== undefined) {
    changed = true;
    bri = input.bri;

  }
  else if (input.brightness !== undefined) {
    changed = true;
    bri = input.brightness;
  }

  // No change
  if (!changed)
    return false;


  // We don't set new mode if brightness was changed
  output.bri = bri;
  return true;
}


/**
 * Parse/Convert input parameters to correct light parameter, update current state and send commands to the light
 * @param  {object} input  Input arguments
 * @return {object}        Updated state parameters
 */
LightItem.prototype.updateColor = function updateColor(input) {

  var newValues = {};
  var isOn = this.state.on;

  // First check if RGB values has been updated
  if (this.updateColorRGB(input, newValues))
    ;

  // If not check if temp values
  else if (this.updateColorTemp(input, newValues))
    ;

  // Always check if brightness is updated
  else if (this.updateColorBri(input, newValues))
    ;

  // Update current state
  _.merge(this.state, newValues);

  var light = this;

  // Ensure that we don't trigger on our own update
  light.modified = process.uptime() + 2;

  // Duration
  var duration = 0;
  if (typeof input.duration === 'number' && input.duration > 0) {
    duration = input.duration;

    // Increase modified value to include transition time
    light.modified += Math.floor(1 + (duration/1000));
  }

  // Light off
  if (isOn && !light.state.on) {
    light.lifx.off(duration);
  }
  // Temperature mode
  else if (light.state.mode == ColorMode.TEMPERATURE) {
    if (isOn && light.state.on) {
      // TODO: Remove when polling is implemented
      light.lifx.on(0);
      // Set color and fade light to new state
      light.lifx.color(light.state.hue || 0, 1, light.state.bri || 0, light.state.kelvin, duration);
    }
    else {
      // Set color for light and then fade the light on
      light.lifx.color(light.state.hue || 0, 1, light.state.bri || 0, light.state.kelvin, 0);
      light.lifx.on(duration);
    }
  }
  // Default mode
  else {
    if (isOn && light.state.on) {
      // TODO: Remove when polling is implemented
      light.lifx.on(0);
      // Set color and fade light to new state
      light.lifx.color(light.state.hue || 0, light.state.sat || 0, light.state.bri, 0, duration);
    }
    else {
      // Set color for light and then fade the light on
      light.lifx.color(light.state.hue || 0, light.state.sat || 0, light.state.bri, 0, 0);
      light.lifx.on(duration);
    }
  }

  this.emit('change');

  return newValues;
}


/**
 * Set if light is reachable
 * @param {boolean} state New reachable state
 */
LightItem.prototype.setReachable = function setReachable(state) {
  var self = this;

  // 
  if (this.info.reachable === state)
    return;

  // Ensure the poll timer is stopped
  if (self.pollTimer)
    clearInterval(self.pollTimer);
  self.pollTimer = null;

  // set reachable
  this.info.reachable = !!state;

  // start polling for changes
  if (this.info.reachable) {
    this.pollTimer = setInterval(this.pollChanges.bind(this), this.config.pollInterval);
    this.pollChanges();    
  }

  self.emit('change');
}


/**
 * Get state for light, also calculates color for different color spaces
 * @return {object} State information
 */
LightItem.prototype.getColors = function getColors() {
  var hsv;

  switch(this.state.mode) {
    case ColorMode.COLOR: {
      hsv = [this.state.hue, this.state.sat, this.state.bri];
      break;
    }
    case ColorMode.BRIGHTNESS: {
      hsv = [0, 0, this.state.bri];
      break;
    }
    // Convert kelvin to rgb and then to hsv
    // replace calculated brightness with light brightness
    case ColorMode.TEMPERATURE: {
      let rgb = colorTemp.temp2rgb(this.state.kelvin);
      hsv = colorSpace.rgb.hsv(rgb);
      hsv[1] = 1;
      hsv[2] = this.state.bri;
      break;
    }
  }

  // Convert to rgb
  let rgb = colorSpace.hsv.rgb(hsv);

  // Return object
  var payload = {
    on:         this.state.on,
    reachable:  this.info.reachable,
    mode:       this.state.mode.value,

    bri:        Math.floor(this.state.bri),

    hsv: [ Math.floor(hsv[0]), Math.floor(hsv[1]), Math.floor(hsv[2]) ],
    rgb: [ Math.floor(rgb[0]), Math.floor(rgb[1]), Math.floor(rgb[2]) ],
  
    hex:   colorConvert.rgb.hex(rgb),
    color: colorConvert.rgb.keyword(rgb),
  }

  // Only generate if we have temperature light
  if (this.state.kelvin !== undefined) {
    payload.kelvin = Math.floor(this.state.kelvin);
    payload.mired  = Math.floor(1000000 / this.state.kelvin);
  }


  var ret = {
    id: this.uniqueid,
    address: this.info.address,
    label: this.info.label,
    payload: payload,
  }

  return ret;
}


/**
 * Update node status to according to light status
 * @param  {object}     node    Flow node
 */
LightItem.prototype.updateNodeStatus = function updateNodeStatus(node) {

  if (!this.info.reachable) {
    node.status({fill:"red",shape:"ring",text:"disconnected"});
  } else if (!this.state.on) {
    node.status({fill:"grey",shape:"dot",text:"off"});
  } else {
    let bri = Math.floor(this.state.bri);
    node.status({fill:"yellow",shape:"dot",text: `on (${bri}%)`});
  }
}


// Export
module.exports = LightItem;
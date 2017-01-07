"use strict";

//var nodeLifx = require('node-lifx');
var _        = require('lodash');
var Enum     = require('enum');

var inherits      = require('util').inherits;  
var EventEmitter  = require('events').EventEmitter;

var colorConvert   = require('color-convert');
var colorTemp      = require('color-temp');
var colorSpace     = require('color-space');


// Light capabilities
const LightCapability = new Enum([
  'BRIGHTNESS',
  'COLOR',
  'TEMPERATURE',
]);


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
 * Ensure that value is inside value range
 * @param  {number} val Current value
 * @param  {number} min Min value
 * @param  {number} max Max value
 * @return {number} Limited value
 */
function limitValue(val, min, max) {
  if (isNaN(val))
    val = min;
  if (val > max)
    val = max;
  if (val < min)
    val = min;
  return val;
}


/**
 * Class
 * @param {LifxLight} lifxLight  Light from node-lifx
 * @param {object}    config     Configuration
 * @param {number}    config.pollInterval Poll interval  
 */
function LightItem(lifxLight, config) {
  EventEmitter.call(this);
  
  this.initialized = false;
  this.uniqueid = lifxLight.id;
  this.lifx     = lifxLight;
  this.modified = 0;

  this.pollTimer = null;

  this.info = {
    id:         lifxLight.id,
    address:    lifxLight.address,
    label:      lifxLight.label,
    reachable:  (lifxLight.status === 'on'),
    capability: LightCapability.BRIGHTNESS
  }

  this.state = {
    on:        false,
    bri:       0,
  }

  // Copy server configuration
  this.config = _.merge({}, config);

  this.config.pollInterval = 500;

}

inherits(LightItem, EventEmitter);



/**
 * Initialize the light
 * @param {function} callback Done callback
 */
LightItem.prototype.initialize = function initialize(callback) {
  var self = this;
  this.lifx.getState((err, info) => {
    if (err) {
      return callback(err);
    }

    // Default to brightness
    self.info.capability = LightCapability.BRIGHTNESS;

    // Check so the info object contains the information we need
    if (_.isObjectLike(info) && _.isObjectLike(info.color)) {
    // Check if we have color
      if (_.isFinite(info.color.hue) && _.isFinite(info.color.saturation)) {
        self.info.capability = LightCapability.get(self.info.capability | LightCapability.COLOR);
      }

      // Check if we have temperature
      if (_.isFinite(info.color.kelvin)) {
        self.info.capability = LightCapability.get(self.info.capability | LightCapability.TEMPERATURE); 
      }
    }

    // Update information
    self.updateInfo(info);

    // Start poll timer
    self.pollTimer = setInterval(self.pollChanges.bind(self), self.config.pollInterval);

    self.initialized = true;
    callback(null);
  });
}



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
LightItem.prototype.parseColorRGB = function updateColorRGB(input, output) {

  // We want to run this function even though we don't have any color capability,
  // this is so we can extract the brightness from the specified color

  var changed = false;  
  var hsv = [this.state.hue||0, this.state.sat||0, this.state.bri||0];

  // hue
  if (_.isFinite(input.hue)) {
    changed = true;
    hsv[0] = limitValue(input.hue, 0, 360);
  }
  // rgb channel
  else if (_.isFinite(input.red)   ||
           _.isFinite(input.green) ||
           _.isFinite(input.blue)) {
    changed = true;
    let rgb = colorSpace.hsv.rgb(hsv);
    if (_.isFinite(input.red))
      rgb[0] = input.red;
    if (_.isFinite(input.green))
      rgb[1] = input.green;
    if (_.isFinite(input.blue))
      rgb[2] = input.blue;

    // Ensure that values is in valid range
    rgb[0] = limitValue(rgb[0], 0, 255);
    rgb[1] = limitValue(rgb[1], 0, 255);
    rgb[2] = limitValue(rgb[2], 0, 255);

    hsv = colorSpace.rgb.hsv(rgb);
  }
  // hex
  else if (_.isString(input.hex) && /^#?[0-9a-fA-F]{6}$/.test(input.hex)) {
    changed = true;
    hsv = colorSpace.rgb.hsv(colorConvert.hex.rgb(input.hex));
  }

  // Saturation
  if (_.isFinite(input.sat)) {
    changed = true;
    hsv[1] = limitValue(input.sat, 0, 100);
  }
  else if (_.isFinite(input.saturation)) {
    changed = true;
    hsv[1] = limitValue(input.sat, 0, 100);
  }

  // No change
  if (!changed)
    return false;

  // No color support
  if (!(this.info.capability & LightCapability.COLOR)) {
    // Check if the brightness has been modified byt the color change
    if (hsv[2] !== this.state.bri) {
      output.bri = limitValue(hsv[2], 0, 100);
      return true;
    }

    return false;
  }

  output.hue = limitValue(hsv[0], 0, 360);
  output.sat = limitValue(hsv[1], 0, 100);
  output.bri = limitValue(hsv[2], 0, 100);

  return true;
}


/**
 * Check if we have new temperature color and calculate updated properties
 * @param  {object} input  Input arguments
 * @param  {object} output New state arguments
 * @return {bool}          Is temperature color updated
 */
LightItem.prototype.parseColorTemp = function parseColorTemp(input, output) {

  // No temperature support
  if (!(this.info.capability & LightCapability.TEMPERATURE))
    return false;

  var changed = false;
  var kelvin  = this.state.kelvin;

  // Mired/Mirek color temperature
  if (_.isFinite(input.ct)) {
    kelvin = 1000000 / limitValue(input.ct, 100, 500);
    changed = true;
  }

  else if (_.isFinite(input.mirek)) {
    kelvin = 1000000 / limitValue(input.mirek, 100, 500);
    changed = true;
  }

  else if (_.isFinite(input.mired)) {
    kelvin = 1000000 / limitValue(input.mired, 100, 500);
    changed = true;
  }

  // Kelvin color temperature
  else if (_.isFinite(input.kelvin)) {
    kelvin = input.kelvin;
    changed = true;
  }

  // No change
  if (!changed)
    return false;

  // Limit kelvin before conversion
  output.kelvin = limitValue(kelvin, 2000, 10000);

  return true;
}


/**
 * Check if we have new brightness value and calculate updated properties
 * @param  {object} input  Input arguments
 * @param  {object} output New state arguments
 * @return {bool}          Is brightness updated
 */
LightItem.prototype.parseBrightness = function updateColorBri(input, output) {
  var bri = this.state.bri;
  var changed = false;
  
  // Brightness
  if (_.isFinite(input.bri)) {
    bri = input.bri;
    changed = true;
  }
  else if (_.isFinite(input.brightness)) {
    bri = input.brightness;
    changed = true;
  }

  // No change
  if (!changed)
    return false;

  // We don't set new mode if brightness was changed
  output.bri = limitValue(bri, 0, 100);
  return true;
}


/**
 * Update light to new state, parse/convert input parameters to correct light parameter
 * @param  {object} input  Input arguments
 * @return {object}        Updated state parameters
 */
LightItem.prototype.setColor = function setColor(input) {
  if (!this.initialized)
    return;

  var newValues = {};
  var isOn = this.state.on;

  // Ensure that input is of correct type
  if (!_.isPlainObject(input)) {
    // Convert boolean to on
    if (_.isBoolean(input)) {
      input = { on: input };
    }
    // On/Off string
    else if (input === 'on' || input === 'off') {
      input = { on: (input === 'on') };
    }
    // Convert number to brightness, also enables the light
    else if (_.isFinite(input)) {
      input = { on: true, bri: input };
    }
    // Unknown input
    else {
      this.emit('warning', 'Unhandled input', input);
      return;
    }
  }

  // First check if RGB values has been updated
  this.parseColorRGB(input, newValues);

  // Then, parse temperature
  this.parseColorTemp(input, newValues);

  // Finally parse brightness
  this.parseBrightness(input, newValues);


  // On/Off
  if (_.isBoolean(input.on))
    newValues.on = input.on;

  // Update current state
  _.merge(this.state, newValues);

  // Ensure that we don't trigger on our own update
  this.modified = process.uptime() + 2;

  // Duration
  var duration = 0;
  if (_.isFinite(input.duration) && input.duration > 0) {
    duration = input.duration;

    // Increase modified value to include transition time
    this.modified += Math.floor(1 + (duration/1000));
  }

  // Light off
  if (isOn && !this.state.on) {
    this.lifx.off(duration);
  }
  // Light change
  else if (isOn && this.state.on) {
    // Fade light to new color
    this.lifx.color(this.state.hue || 0, this.state.sat || 0, this.state.bri, this.state.kelvin || 3500, duration);
  }
  // Light on
  else {
    // Set color for light and then fade the light on
    this.lifx.color(this.state.hue || 0, this.state.sat || 0, this.state.bri, this.state.kelvin || 3500, 0);
    this.lifx.on(duration);
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

  // Not initialized yet
  if (this.initialized)
    return;

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
  var self = this;
  var hsv;

  // Use color
  if (self.info.capability & LightCapability.COLOR) {
    hsv = [this.state.hue, this.state.sat, this.state.bri];
  }
  // Use temperature for color and output it
  else if (self.info.capability & LightCapability.TEMPERATURE) {
    let rgb = colorTemp.temp2rgb(this.state.kelvin);
    hsv = colorSpace.rgb.hsv(rgb);
    hsv[1] = 5;
    hsv[2] = this.state.bri;
  }
  // Use only brightness for color
  else {
    hsv = [0, 0, this.state.bri];
  }

  // Convert to rgb
  let rgb = colorSpace.hsv.rgb(hsv);

  // Return object
  var payload = {
    on:         this.state.on,
    reachable:  this.info.reachable,

    bri:        Math.floor(this.state.bri),

    hsv: [ Math.floor(hsv[0]), Math.floor(hsv[1]), Math.floor(hsv[2]) ],
    rgb: [ Math.floor(rgb[0]), Math.floor(rgb[1]), Math.floor(rgb[2]) ],
  
    hex:   colorConvert.rgb.hex(rgb),
    color: colorConvert.rgb.keyword(rgb),
  }

  // Append temperature information if we have the capability
  if (self.info.capability & LightCapability.TEMPERATURE) {
    payload.kelvin = Math.floor(this.state.kelvin);
    payload.mired  = Math.floor(1000000 / this.state.kelvin);
  }

  var ret = {
    id: this.uniqueid,
    address: this.info.address,
    label: this.info.label,
    payload: payload,
  
    capability: LightCapability.enums.reduce((coll, enumItem) => {
      if (self.info.capability & enumItem)
        coll.push(enumItem.key.toLowerCase());
      return coll;
    }, []),
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
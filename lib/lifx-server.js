"use strict";

var nodeLifx = require('node-lifx');
var _        = require('lodash');
var Enum     = require('enum');

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
 * Class
 * @param {[type]} lifxLight [description]
 */
function LightItem(lifxLight) {
  this.uniqueid = lifxLight.id;
  this.lifx     = lifxLight;

  this.modified = 0;

  this.info = {
    address: lifxLight.address,
    label:   lifxLight.label,
  }

  this.state = {
    on:        false,
    reachable: (lifxLight.status === 'on'),
    mode:      ColorMode.BRIGHTNESS,
    bri:       0,
  }
}


/**
 * Initialize light, fetches current state
 * @param  {Function} callback Done callback
 */
LightItem.prototype.initialize = function initialize(callback) {
  var self = this;

  // Setup base functionality
  this.lifx.getState((err, info) => {
    if (err) {
      return callback(err);
    }

    this.state.on = (info.power !== 0);
    self.state.bri = info.color.brightness || 0;

    if (info.color.hue !== undefined)
      self.state.hue = info.color.hue;
    if (info.color.saturation !== undefined)
      self.state.sat = info.color.saturation;
    if (info.color.kelvin !== undefined)
      self.state.kelvin = info.color.kelvin;

    // Set color type for light
    if (self.state.hue !== undefined)
      this.state.mode = ColorMode.COLOR;
    else if (self.state.kelvin !== undefined)
      this.state.mode = ColorMode.TEMPERATURE
    else
      this.state.mode = ColorMode.BRIGHTNESS;


    callback(null);
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
 * Parse/Convert input parameters to correct light parameter and update current state
 * @param  {object} input  Input arguments
 * @return {object}        Updated state parameters
 */
LightItem.prototype.updateColor = function updateColor(input) {

  var newValues = {};

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

  return newValues;
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
  var ret = {
    on:         this.state.on,
    reachable:  this.state.reachable,
    mode:       this.state.mode.value,

    bri:        Math.floor(this.state.bri),

    hsv: [ Math.floor(hsv[0]), Math.floor(hsv[1]), Math.floor(hsv[2]) ],
    rgb: [ Math.floor(rgb[0]), Math.floor(rgb[1]), Math.floor(rgb[2]) ],
  
    hex:   colorConvert.rgb.hex(rgb),
    color: colorConvert.rgb.keyword(rgb),
  }

  // Only generate if we have temperature light
  if (this.state.kelvin !== undefined) {
    ret.kelvin = Math.floor(this.state.kelvin);
  }

  return ret;
}


/**
 * Update node state depending on light status
 * @param  {object}     node    Flow node
 * @param  {LightItem}  light   Light item
 */
function updateNodeStatus(node, light) {

  if (!light.state.reachable) {
    node.status({fill:"red",shape:"ring",text:"disconnected"});
  } else if (!light.state.on) {
    node.status({fill:"grey",shape:"dot",text:"off"});
  } else {
    let bri = Math.floor(light.state.bri);
    node.status({fill:"yellow",shape:"dot",text: `on (${bri}%)`});
  }
}


/**
 * Create new light server
 * @param {object} config Configuraion
 */
function LightServer(config) {
  var self = this;

  self.config = {};

  self.config.name      = config.name;
  self.config.address   = config.address;
  self.config.broadcast = config.broadcast;
  self.config.lights    = config.lights;
  self.config.interval  = config.interval;

  // Ensure that we don't use to low poll interval
  if (self.config.interval !== 'number' || self.config.interval < 500)
    self.config.interval = 500;

  this.nodeListID = {};
  this.nodeListIDCount = 0;

  this.lights = {
    uniqueid: {},
    label: {},
    address: {},
  }

  this.lifxConfig = {
    debug: false
  };


  /**
   * Check if value is non empty string
   * @param  {*}  x    Value to check
   * @return {boolean} Non empty string
   */
  function isStringVal(x) {
    return typeof x === 'string' && x.length;
  }

  if (isStringVal(self.config.address))
    this.lifxConfig.address = this.config.address;
  if (isStringVal(self.config.broadcast))
    this.lifxConfig.broadcast = this.config.broadcast;
  if (isStringVal(self.config.lights))
    this.lifxConfig.lights = this.config.lights.split(/ *, */g);

  this.lifxClient = new nodeLifx.Client();

  // New lifx detected
  this.lifxClient.on('light-new', (lightNew) => {

    var light = new LightItem(lightNew);

    light.initialize((err) => {
      if (err) {
        console.log(err);
        return;
      }

      self.lights.uniqueid[light.uniqueid] = light;    
      self.statusUpdateLight(light);
    });
  });


  // Offline state detected
  this.lifxClient.on('light-offline', (lightOffline) => {
    let uniqueid = lightOffline.id;
    if (!self.lights.uniqueid.hasOwnProperty(uniqueid))
      return;

    var light = self.lights.uniqueid[uniqueid];
    light.state.reachable = false;

    self.statusUpdateLight(light);
  })

  // Online state detected
  this.lifxClient.on('light-online', (lightOnline) => {
    let uniqueid = lightOnline.id;

    if (!self.lights.uniqueid.hasOwnProperty(uniqueid))
      return;

    var light = self.lights.uniqueid[uniqueid];
    light.state.reachable = true;
  
    light.getState((err, info) => {
      light.state.on = (!err && info && info.power === 1);
      if (!err) {
        light.state.hue = info.color.hue;
        light.state.sat = info.color.saturation;
        light.state.bri = info.color.brightness;
      }

      self.statusUpdateLight(light);
    });
  })
 
  this.lifxClient.init(this.lifxConfig);
}


/**
 * Stop the server
 */
LightServer.prototype.stop = function stop() {
  if (this.lightPollInterval !== null)
    clearInterval(this.lightPollInterval);
  this.lightPollInterval = null;
  
  this.lifxClient.stopDiscovery();
  this.lifxClient.stopSendingProcess();
  this.lifxClient.destroy();
  this.lifxClient = null;
}


/**
 * Using light find all connected nodes and update state for them
 * @param  {LightItem} light Light
 */
LightServer.prototype.statusUpdateLight = function statusUpdateLight(light) {
  //var self = this;

  if (this.nodeListID.hasOwnProperty(light.uniqueid)) {
    let tmp = this.nodeListID[light.uniqueid];
    Object.keys(tmp).forEach((item) => {
      updateNodeStatus(tmp[item], light);
      if (tmp[item].isOutput)
        tmp[item].send(light.getColors());
    });
  }
};


/**
 * Add Node-Red node to the server
 * @param {string} lightID ID/Label of the light
 * @param {string} nodeID  ID for the node
 * @param {object} node    Node-Red object
 */
LightServer.prototype.nodeRegister = function registerNode(lightID, nodeID, node) {
  if (!this.nodeListID.hasOwnProperty(lightID))
    this.nodeListID[lightID] = {};
  this.nodeListID[lightID][nodeID] = node;

  if (this.lights.uniqueid.hasOwnProperty(lightID)) {
    let light = this.lights.uniqueid[lightID];
    updateNodeStatus(light, node);
    if (node.isOutput)
      node.send(light.getColors());
    return;
  }

  // Light not found (yet), set status to unknown
  node.status({fill:"red",shape:"ring",text:"unknown"});
};


/**
 * Remove Node-Red node from the server
 * @param  {string} lightID ID/Label for the light
 * @param  {string} nodeID  ID for the node
 */
LightServer.prototype.nodeUnregister = function unregisterNode(lightID, nodeID) {

  if (!this.nodeListID.hasOwnProperty(lightID))
    return;

  if (!this.nodeListID[lightID].hasOwnProperty(nodeID))
    return;
  
  delete this.nodeListID[lightID][nodeID];
};


/**
 * Change light state
 * @param  {string} lightID ID/Label for the light
 * @param  {object} value   New values for the light
 */
LightServer.prototype.lightChange = function lightChange(lightID, value) {
  var self = this;

  if (!this.lights.uniqueid.hasOwnProperty(lightID))
    return;

  var light = this.lights.uniqueid[lightID];

  // Ensure that we don't trigger on our own update
  light.modified = process.uptime() + 1;

  // Update light color
  light.updateColor(value);

  var isOn = light.state.on;

  if (typeof value.on === 'boolean') {
    light.state.on = value.on;
  }

  var duration = 0;
  if (typeof value.delay === 'number') {
    duration = value.delay;
    // Increase modified value to include delay
    light.modified += Math.floor(1 + (value.delay/1000));
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
      light.lifx.color(light.state.hue, 1, light.state.bri, light.state.kelvin, duration);
    }
    else {
      // Set color for light and then fade the light on
      light.lifx.color(light.state.hue, 1, light.state.bri, light.state.kelvin, 0);
      light.lifx.on(duration);
    }
  }
  // Default mode
  else {
    if (isOn && light.state.on) {
      // TODO: Remove when polling is implemented
      light.lifx.on(0);
      // Set color and fade light to new state
      light.lifx.color(light.state.hue, light.state.sat, light.state.bri, 0, duration);
    }
    else {
      // Set color for light and then fade the light on
      light.lifx.color(light.state.hue, light.state.sat, light.state.bri, 0, 0);
      light.lifx.on(duration);
    }
  }

  // No nodes for this light
  if (!this.nodeListID.hasOwnProperty(lightID))
    return 

  // Calculate colors for this light
  var newStateColors = light.getColors();

  // Update status for all nodes and send data to input nodes
  Object.keys(this.nodeListID[lightID]).forEach((nodeID) => {
    var node = self.nodeListID[lightID][nodeID];
    
    updateNodeStatus(node, light);
    if (node.isOutput === true)
      node.send(newStateColors);
  });
}


/**
 * Retreive list of detected lights
 * @return {array} Array with id, address and label for each light
 */
LightServer.prototype.getLights = function getLights() {
  var self = this;
  var retVal = Object.keys(self.lights.uniqueid).reduce((coll, lightid) => {
    var light = self.lights.uniqueid[lightid];
    var val = { id: light.uniqueid, address: light.info.address, name: light.info.label };
    coll.push(val);
    return coll;
  }, []);

  return retVal;
 }


/**
 * Exports LightServer to Node-Red
 * @param  {object} RED Node-red
 */
module.exports = function(RED) {
  // list of servers
  var lifxServerList = {};

  /**
   * LightServer wrapper for Node-Red
   * @param {object} config Configuration
   */
  function LightServerWrapper(config) {
    var self = this;
    RED.nodes.createNode(self, config);

    self.name    = config.name;
    self.key     = config.key;
    self.network = config.network;
    self.interval= config.interval;

    // Create server
    this.lightServer = new LightServer(config);
  
    // Create wrapper functions
    this.stop           = this.lightServer.stop.bind(this.lightServer);
    
    this.nodeRegister   = this.lightServer.nodeRegister.bind(this.lightServer);
    this.nodeUnregister = this.lightServer.nodeUnregister.bind(this.lightServer);
    
    this.lightChange    = this.lightServer.lightChange.bind(this.lightServer);

    this.getLights      = this.lightServer.getLights.bind(this.lightServer);

    // Handle close event
    self.on('close', () => {
      self.stop();

      delete lifxServerList[self.id];
    });

    lifxServerList[self.id] = self;
  }

  RED.nodes.registerType("node-lifx-server", LightServerWrapper);

  // Get list of lights
  RED.httpAdmin.get('/node-lifx/lights', function(req, res) {
    if(!req.query.server) {
      res.status(500).send("Missing arguments");
      return;
    }

    // Query server for information
    if (lifxServerList.hasOwnProperty(req.query.server)) {
      var server = lifxServerList[req.query.server];

      res.set({'content-type': 'application/json; charset=utf-8'})
      res.end(JSON.stringify(server.getLights()));
      return;
    }

    res.status(500).send("Server not found or not activated");
    return;
  });

}

"use strict";
var colorConvert  = require('color-convert');
var colorTemp     = require('color-temp');
var nodeLifx      = require('node-lifx');
var rgbHex        = require('rgb-hex');


/**
 * Server managing all connection against Lifx
 * @class  LifxServer
 */
function LifxServer() {
  var self = this;

  this.lifxClient = null;
  this.lifxNodeCount = 0;

  this.lifxLights = {};
  this.lifxLightLabels = {};

  this.nodeList = {};

  this.lifxConfig = {
    debug: false
  };

  this.defaultRGB = '#555555';

  this.lifxClient = new nodeLifx.Client();

  this.createNewLight = function createNewLight(lifxLight, id, label) {
    var newLight = {
      light: lifxLight,
      info: {
        id: id,
        label: null,
        online: true
      },
      state: {
        on: true,
        hex: self.defaultRGB,

        red: 0,
        green: 0,
        blue: 0,

        hue: 0,
        saturation: 0,
        brightness: 0,
        
        kelvin: 3500,
      }
    };

    stateColorUpdate('hex', newLight.state);
    return newLight;
  };

  // New lifx detected
  this.lifxClient.on('light-new', (light) => {
    //console.log('light-new', light);
    let newLightID = light.id;

    var newLight = this.createNewLight(light, light.id, null);

    newLight.info.address = light.address;
    newLight.info.port    = light.port;
    newLight.info.online  =(light.status == 'on');

    self.lifxLights[newLightID] = newLight;

    light.getState((err, info) => {
      newLight.state.on = (!err && info && info.power === 1);
      if (!err) {
        newLight.state.hue        = info.color.hue;
        newLight.state.saturation = info.color.saturation;
        newLight.state.brightness = info.color.brightness;
        stateColorUpdate('hsl', newLight.state);
      }

      self.lifxLabelUpdate(info.label, newLight);
      self.updateStatusFromLight(newLight);
    });
  });

  // Offline state detected
  this.lifxClient.on('light-offline', (light) => {
    let newLightID = light.id;
    if (!self.lifxLights.hasOwnProperty(newLightID))
      return;

    var newLight = self.lifxLights[newLightID];
    newLight.info.online = false;

    self.updateStatusFromLight(newLight);
  })

  // Online state detected
  this.lifxClient.on('light-online', (light) => {
    let newLightID = light.id;

    if (!self.lifxLights.hasOwnProperty(newLightID))
      return;

    var newLight = self.lifxLights[newLightID];
    newLight.info.online = true;
    light.getState((err, info) => {
      newLight.state.on = (!err && info && info.power === 1);
      if (!err) {
        newLight.state.hue = info.color.hue;
        newLight.state.saturation = info.color.saturation;
        newLight.state.brightness = info.color.brightness;
        stateColorUpdate('hsl', newLight.state);
      }

      self.lifxLabelUpdate(info.label, newLight);
      self.updateStatusFromLight(newLight);
    });
  })

  this.lifxClient.init(this.lifxConfig);
}


/**
 * Update label lookup table used for Lifx lamp
 * @param  {string} label New label
 * @param  {object} light Current light with old label
 */
LifxServer.prototype.lifxLabelUpdate = function lifxLabelUpdate(label, light) {
  var self = this;

  if (typeof light.info.label === 'string' &&
      light.info.label != '' && 
      self.lifxLightLabels.hasOwnProperty(light.info.label)) {
    delete self.lifxLightLabels[light.info.label];
    light.info.label = null;
  }

  if (typeof label === 'string' &&
      label != '' &&
      !self.lifxLightLabels.hasOwnProperty(label)) {
    self.lifxLightLabels[label] = light;
    light.info.label = label;
  }
}


/**
 * Update node icon state depending on light state
 * @param  {object} node  Flow node
 * @param  {light}  light Lifx light
 */
LifxServer.prototype.updateStatus = function updateStatus(node, light) {
  if (!light.info.online) {
    node.status({fill:"red",shape:"ring",text:"disconnected"});
  } else if (!light.state.on) {
    node.status({fill:"grey",shape:"dot",text:"off"});
  } else {
    //node.status({fill:"yellow",shape:"dot",text: `on (${light.state.hue}° ${light.state.saturation}% ${light.state.brightness}%)`});
    node.status({fill:"green",shape:"dot",text: `on (${light.state.hex})`});
  }

  if (node.isOutput === true)
    node.send(light.state);
}

/**
 * Using node get light and update icon for the node
 * @param  {object} node Flow node
 */
LifxServer.prototype.updateStatusFromNode = function updateStatusFromNode(node) {
  var light = null;
  if (this.lifxLights.hasOwnProperty(node.lightID)) {
    light = this.lifxLights[node.lightID];
  }
  else if (this.lifxLightLabels.hasOwnProperty(node.lightID)) {
    light = this.lifxLightLabels[node.lightID];
  }
  else {
    return;
  }
  this.updateStatus(node, light);
};

/**
 * Using light find all connected nodes and update icon for them
 * @param  {object} light Lifx light
 */
LifxServer.prototype.updateStatusFromLight = function updateStatusFromLight(light) {
  var self = this;

  if (this.nodeList.hasOwnProperty(light.info.id)) {
    let tmp = this.nodeList[light.info.id];
    Object.keys(tmp).forEach((item) => {
      self.updateStatus(tmp[item], light);
    });
  }

  if (typeof light.info.label === 'string' &&
      light.info.label !== '' && 
      this.nodeList.hasOwnProperty(light.info.label)) {

    let tmp = this.nodeList[light.info.label];
    Object.keys(tmp).forEach((item) => {
      self.updateStatus(tmp[item], light);
    });
  }
};


/**
 * Add Node-Red node to the server
 * @param {string} lightID ID/Label of the light
 * @param {string} nodeID  ID for the node
 * @param {object} node    Node-Red object
 */
LifxServer.prototype.addNode = function addNode(lightID, nodeID, node) {

  // Emulate light when using node beginning with 'node-red-demo'
  if (lightID.startsWith('node-red-demo') && !this.lifxLightLabels.hasOwnProperty(lightID)) {
    var lightFunctions = {
      on:     function() {},
      color:  function() {},
      off:    function() {},
    };

    let newLight = this.createNewLight(lightFunctions, null, lightID);
    this.lifxLabelUpdate(lightID, newLight);
  }


  if (!this.nodeList.hasOwnProperty(lightID))
    this.nodeList[lightID] = {};
  this.nodeList[lightID][nodeID] = node;

  this.updateStatusFromNode(node);
};

/**
 * Remove Node-Red node from the server
 * @param  {string} lightID ID/Label for the light
 * @param  {string} nodeID  ID for the node
 */
LifxServer.prototype.removeNode = function removeNode(lightID, nodeID) {
  if (typeof lightID === 'string' && lightID !== '')
    delete this.nodeList[lightID][nodeID];
};


/**
 * Tries to find Lifx light from ID or label
 * @param  {string} lightID ID/Label of the light
 * @return {object} Found light
 * @return {null}   If no light is found
 */
LifxServer.prototype.findLight = function getLight(lightID) {
  // Search found linghts by id
  if (this.lifxLights.hasOwnProperty(lightID)) {
    return this.lifxLights[lightID];
  }
  
  // Search by label
  if (this.lifxLightLabels.hasOwnProperty(lightID)) {
    return this.lifxLightLabels[lightID];
  }

  return null;
}


/**
 * Global instance of server and refcounter
 */
var globalLifxServer = null;
var globalClientCount = 0;


/**
 * Add Node-Red node to global server, creates one if no server exists
 * @param {string} lightID ID/Label of the light
 * @param {string} nodeID  ID for the node
 * @param {object} node    Node-Red object
 */
function addNode(lightID, nodeID, node) {
  if (!globalLifxServer)
    globalLifxServer = new LifxServer();

  globalLifxServer.addNode(lightID, nodeID, node);
  globalClientCount++;
}

/**
 * Remove Node-Red node from the server, removes server if no references
 * @param  {string} lightID ID/Label for the light
 * @param  {string} nodeID  ID for the node
 */
function removeNode(lightID, nodeID) {
  globalLifxServer.removeNode(lightID, nodeID);
  globalClientCount--;

  if (globalClientCount <= 0) {
    globalLifxServer.lifxLights = {};
    globalLifxServer.lifxLightLabels = {};
    globalLifxServer.nodeList = {};

    globalLifxServer.lifxClient.stopDiscovery();
    globalLifxServer.lifxClient.stopSendingProcess();
    globalLifxServer.lifxClient.destroy();
    globalLifxServer.lifxClient = null;

    globalClientCount = 0;

    globalLifxServer = null;
  }
}


/**
 * Using node get light and update icon for the node
 * @param  {object} node Flow node
 */
function updateStatusFromNode(node) {
  return globalLifxServer.updateStatusFromNode(node);
}


/**
 * Using light find all connected nodes and update icon for them
 * @param  {object} light Lifx light
 */
function updateStatusFromLight(light) {
  return globalLifxServer.updateStatusFromLight(light);
}

/**
 * Tries to find Lifx light from ID or label
 * @param  {string} lightID ID/Label of the light
 * @return {object} Found light
 * @return {null}   If no light is found
 */
function findLight(lightID) {
  return globalLifxServer.findLight(lightID);
}


/**
 * Calculate color fields in state based on one source value property
 * @param  {string} source Which value to select as source
 * @param  {object} state  State object
 */
function stateColorUpdate(source, state) {
  //var hsl = [state.hue, state.saturation, state.brightness];
  var rgb = [state.red, state.green, state.blue];

  try {
    switch(source) {
      case 'hex':
        rgb = colorConvert.hex.rgb.raw(state.hex);
        break;
      case 'hsl':
        rgb = colorConvert.hsl.rgb.raw(state.hue, state.saturation, state.brightness);
        break;
      case 'kelvin':
        // Convert Kelvin to rgb
        rgb = colorTemp.temp2rgb(state.kelvin);

        // Convert RGB to HSL
        let hsl = colorConvert.rgb.hsl.raw(rgb[0], rgb[1], rgb[2]);

        // Convert back to RGB but use the original brightness
        rgb = colorConvert.hsl.rgb.raw(hsl[0], hsl[1], state.brightness);
        break;
      case 'rgb':
      default:
        break;
    }
  }
  catch(e) {
    console.log(e);
    rgb = [5, 5, 5];
    //hsl = [1, 50, 50];
  }

  let tmp;

  // RGB
  state.red   = Math.round(rgb[0]);
  state.green = Math.round(rgb[1]);
  state.blue  = Math.round(rgb[2]);

  // Hex
  state.hex = '#' + colorConvert.rgb.hex(rgb);

  // HSL
  tmp = colorConvert.rgb.hsl(rgb);
  state.hue        = tmp[0];
  state.saturation = tmp[1];
  state.brightness = tmp[2];

  // Color name
  state.color = colorConvert.rgb.keyword(rgb);
}

module.exports.addNode = addNode;
module.exports.findLight = findLight;
module.exports.removeNode = removeNode;
module.exports.updateStatusFromNode = updateStatusFromNode;
module.exports.updateStatusFromLight = updateStatusFromLight;
module.exports.stateColorUpdate = stateColorUpdate;

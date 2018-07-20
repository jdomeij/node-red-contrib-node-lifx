/* eslint-env mocha */
"use strict";

var LifxLight = require('../lib/lifx-light.js');
//var _ = require('lodash');

var chai      = require('chai');
var chaiSpies = require('chai-spies');

chai.use(chaiSpies);

var expect = chai.expect;


const defaultID = '123456789';
/**
 * Emulates node-lifx
 */
function LifxEmulator() {
  var self = this;

  self.id = '123456789';
  self.address = '1.1.1.1';
  self.port = 56700;
  self.label = null;
  self.status = 'on';
  self.seenOnDiscovery = 1;

  // getState return values
  this._getStateErr = null;
  this._getStateData = {
    color: {
      hue: 0,
      saturation: 100,
      brightness: 100,
      kelvin: 4000
    },
    power: 1,
    label: 'Test Lifx'
  };

  this.getState = function(callback) {
    callback(self._getStateErr, self._getStateData);
  };

  // getHardwareVersion return values
  this._getHWVerErr = null;
  this._getHWVerData = {
    vendorId: 1,
    productId: 1,
    version: 6,
    vendorName: 'LIFX',
    productName: 'Original 1000',
    productFeatures: {
      color: true,
      infrared: false,
      multizone: false
    }
  };

  this.getHardwareVersion = function(callback) {
    callback(self._getHWVerErr, self._getHWVerData);
  };

}


describe('Lifx-Light', () => {
  describe('constructor', () => {
    it('Default light', (done) => {
      var lightItem = new LifxLight(defaultID, new LifxEmulator, {});
      expect(lightItem.id).to.equal(defaultID);
      done();
    });
  });

  describe('parseColorRGB', () => {
    var lightItem, lifxItem;
    beforeEach((done) => {
      lifxItem = new LifxEmulator();
      lifxItem._getStateData.color = {
        hue: 0,
        saturation: 100,
        brightness: 100,
        kelvin: 3500
      };

      lightItem = new LifxLight(lifxItem.id, lifxItem, {});
      lightItem.initialize((err) => {
        if (err)
          return done(err);
        lightItem.stop();
        done();
      });
    });
    afterEach(() => {
      lightItem = null;
      lifxItem = null;
    });


    it('hue: 123', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorRGB({'hue': 123}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.hue).to.equal(123);

      done();
    });

    it('hex: #ff0000', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorRGB({'hex': '#ff0000'}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.hue).to.equal(0);
      expect(output.saturation).to.equal(100);
      expect(output.brightness).to.equal(100);

      done();
    });


    it('hex: #0077FF', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorRGB({'hex': '#123456'}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.hue).to.equal(210);
      expect(output.saturation).to.equal(79);
      expect(output.brightness).to.equal(34);

      done();
    });

    it('red: 0x12, green: 0x34, blue: 0x56', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorRGB({red: 0x12, green: 0x34, blue: 0x56}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.hue).to.equal(210);
      expect(output.saturation).to.equal(79);
      expect(output.brightness).to.equal(34);

      done();
    });

    it('green: 0xFFF, red: NaN', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorRGB({green: 0xFFF}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.hue).to.equal(60);
      expect(output.saturation).to.equal(100);
      expect(output.brightness).to.equal(100);

      done();
    });

    it('blue: -1', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorRGB({blue: -1}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.hue).to.equal(0);
      expect(output.saturation).to.equal(100);
      expect(output.brightness).to.equal(100);

      done();
    });


    it('rgb: [0x12, 0x34, 0x56]', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorRGB({rgb: [0x12, 0x34, 0x56]}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.hue).to.equal(210);
      expect(output.saturation).to.equal(79);
      expect(output.brightness).to.equal(34);

      done();
    });


    it('hue: 123', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorRGB({'hex': '#123456'}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.hue).to.equal(210);
      expect(output.saturation).to.equal(79);
      expect(output.brightness).to.equal(34);

      done();
    });

    it('sat: 33', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorRGB({'sat': 33}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.hue).to.equal(0);
      expect(output.saturation).to.equal(33);
      expect(output.brightness).to.equal(100);

      done();
    });

    it('saturation: 33', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorRGB({'saturation': 33}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.hue).to.equal(0);
      expect(output.saturation).to.equal(33);
      expect(output.brightness).to.equal(100);

      done();
    });
  });

  describe('parseColorTemp', () => {
    var lightItem, lifxItem;
    beforeEach((done) => {
      lifxItem = new LifxEmulator();
      lifxItem._getStateData.color = {
        hue: 0,
        saturation: 100,
        brightness: 100,
        kelvin: 3500
      };

      lightItem = new LifxLight(lifxItem.id, lifxItem, {});
      lightItem.initialize((err) => {
        if (err)
          return done(err);
        lightItem.stop();
        done();
      });
    });
    afterEach(() => {
      lightItem = null;
      lifxItem = null;
    });

    it('kelvin: 3000', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorTemp({'kelvin': 3000}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.kelvin).to.equal(3000);

      done();
    });

    it('ct: 1000000/3000', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorTemp({'ct': 1000000/3000}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.kelvin).to.equal(3000);

      done();
    });

    it('mired: 1000000/3000', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorTemp({'mired': 1000000/3000}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.kelvin).to.equal(3000);

      done();
    });

    it('mirek: 1000000/3000', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseColorTemp({'mirek': 1000000/3000}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.kelvin).to.equal(3000);

      done();
    });


  });

  describe('parseBrightness', () => {
    var lightItem, lifxItem;
    beforeEach((done) => {
      lifxItem = new LifxEmulator();
      lifxItem._getStateData.color = {
        hue: 0,
        saturation: 0,
        brightness: 1,
        kelvin: 3500
      };

      lightItem = new LifxLight(defaultID, lifxItem, {});
      lightItem.initialize((err) => {
        if (err)
          return done(err);
        lightItem.stop();
        done();
      });
    });
    afterEach(() => {
      lightItem = null;
      lifxItem = null;
    });

    it('bri: 33', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseBrightness({'bri': 33}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.brightness).to.equal(33);

      done();
    });

    it('brightness: 33', (done) => {
      var output = {};
      var tmp;
      tmp = lightItem.parseBrightness({'brightness': 33}, output);

      expect(tmp).to.equal(true);
      expect(output).to.be.an('object');
      expect(output.brightness).to.equal(33);

      done();
    });
  });

  describe('setColor', () => {
    var lightItem, lifxItem;
    beforeEach((done) => {
      lifxItem = new LifxEmulator();
      lifxItem.color = chai.spy();
      lifxItem.on    = chai.spy();
      lifxItem.off   = chai.spy();

      lightItem = new LifxLight(defaultID, lifxItem, true);
      lightItem.initialize((err) => {
        if (err)
          return done(err);
        lightItem.stop();
        done();
      });
    });
    afterEach(() => {
      lightItem = null;
      lifxItem = null;
    });

    it('hex: #0000FF', (done) => {
      lightItem.setColor({hex: '#0000FF'});
      //console.log(lifxItem.color.__spy.calls[0]);
      expect(lifxItem.color).to.have.been.called();
      expect(lifxItem.color).to.have.been.called.with.exactly(240, 100, 100, 4000, 0);
      done();
    });
  
    it('kelvin: 3500', (done) => {
      lightItem.setColor({kelvin: 3500});
      expect(lifxItem.color).to.have.been.called();
      expect(lifxItem.color).to.have.been.called.with.exactly(0, 100, 100, 3500, 0);
      done();
    });

    it('brightness: 50', (done) => {
      lightItem.setColor({brightness: 50});
      expect(lifxItem.color).to.have.been.called();
      expect(lifxItem.color).to.have.been.called.with.exactly(0, 100, 50, 4000, 0);
      done();
    });

    it('{ on: false, hex: "#00ff00"}', (done) => {
      lightItem.setColor({ on: false, hex: '#00ff00', duration: 1000 });
      expect(lifxItem.off).to.have.been.called();
      expect(lifxItem.color).to.have.not.been.called();
      done();
    });



    it('50 (brightness)', (done) => {
      lightItem.setColor(50);
      expect(lifxItem.color).to.have.been.called();
      expect(lifxItem.color).to.have.been.called.with.exactly(0, 100, 50, 4000, 0);
      done();
    });

    it('50% bri over 5s', (done) => {
      lightItem.setColor({ 'bri': 50, duration: 5000});
      expect(lifxItem.color).to.have.been.called();
      expect(lifxItem.color).to.have.been.called.with.exactly(0, 100, 50, 4000, 5000);
      done();
    });

    it('Off->On (50%)', (done) => {
      lightItem.state.on = false;
      lightItem.setColor({'on': true, bri: 50, duration: 5000});
      expect(lifxItem.on).to.have.been.called();
      expect(lifxItem.color).to.have.been.called();
      expect(lifxItem.on).to.have.been.called.with.exactly(5000);
      expect(lifxItem.color).to.have.been.called.with.exactly(0, 100, 50, 4000, 0);
      done();
    });

    describe('Off', () => {

      beforeEach(() => {
        lightItem.state.on = true;
      });

      it('false', (done) => {
        lightItem.setColor(false);
        expect(lifxItem.on).to.not.have.been.called();
        expect(lifxItem.off).to.have.been.called();
        done();
      });

      it('"off"', (done) => {
        lightItem.setColor("off");
        expect(lifxItem.on).to.not.have.been.called();
        expect(lifxItem.off).to.have.been.called();
        done();
      });

      it('{on:false}', (done) => {
        lightItem.setColor({on:false});
        expect(lifxItem.on).to.not.have.been.called();
        expect(lifxItem.off).to.have.been.called();
        done();
      });

      it('{on:"false"}', (done) => {
        lightItem.setColor({on:"false"});
        expect(lifxItem.on).to.not.have.been.called();
        expect(lifxItem.off).to.have.been.called();
        done();
      });

      it('{on:0}', (done) => {
        lightItem.setColor({on:0});
        expect(lifxItem.on).to.not.have.been.called();
        expect(lifxItem.off).to.have.been.called();
        done();
      });

      it('{on:"off"}', (done) => {
        lightItem.setColor({on:"off"});
        expect(lifxItem.on).to.not.have.been.called();
        expect(lifxItem.off).to.have.been.called();
        done();
      });

      it('{on:false}', (done) => {
        lightItem.setColor({on:"false"});
        expect(lifxItem.on).to.not.have.been.called();
        expect(lifxItem.off).to.have.been.called();
        done();
      });
    });
    describe('On', () => {
      beforeEach(() => {
        lightItem.state.on = false;
      });

      it('true', (done) => {
        lightItem.setColor(true);
        expect(lifxItem.off).to.not.have.been.called();
        expect(lifxItem.on).to.have.been.called();
        done();
      });

      it('"on"', (done) => {
        lightItem.setColor("on");
        expect(lifxItem.off).to.not.have.been.called();
        expect(lifxItem.on).to.have.been.called();
        done();
      });

      it('{on:true}', (done) => {
        lightItem.setColor({on:true});
        expect(lifxItem.off).to.not.have.been.called();
        expect(lifxItem.on).to.have.been.called();
        done();
      });

      it('{on:"true"}', (done) => {
        lightItem.setColor({on:"true"});
        expect(lifxItem.off).to.not.have.been.called();
        expect(lifxItem.on).to.have.been.called();
        done();
      });

      it('{on:1}', (done) => {
        lightItem.setColor({on:1});
        expect(lifxItem.off).to.not.have.been.called();
        expect(lifxItem.on).to.have.been.called();
        done();
      });

      it('{on:"on"}', (done) => {
        lightItem.setColor({on:"on"});
        expect(lifxItem.off).to.not.have.been.called();
        expect(lifxItem.on).to.have.been.called();
        done();
      });

      it('{on:true}', (done) => {
        lightItem.setColor({on:"true"});
        expect(lifxItem.off).to.not.have.been.called();
        expect(lifxItem.on).to.have.been.called();
        done();
      });
    });

    describe('Toggle', () => {
      it('"toggle"  on => off', (done) => {
        lightItem.state.on = true;

        lightItem.setColor('toggle');
        expect(lifxItem.on).to.not.have.been.called();
        expect(lifxItem.off).to.have.been.called();
        done();
      });
      it('"toggle"  off => on', (done) => {
        lightItem.state.on = false;

        lightItem.setColor('toggle');
        expect(lifxItem.off).to.not.have.been.called();
        expect(lifxItem.on).to.have.been.called();
        done();
      });
      it('{on:"toggle"}  on => off', (done) => {
        lightItem.state.on = true;

        lightItem.setColor({on:'toggle'});
        expect(lifxItem.on).to.not.have.been.called();
        expect(lifxItem.off).to.have.been.called();
        done();
      });
      it('{on:"toggle"}  off => on', (done) => {
        lightItem.state.on = false;

        lightItem.setColor({on:'toggle'});
        expect(lifxItem.off).to.not.have.been.called();
        expect(lifxItem.on).to.have.been.called();
        done();
      });
    });
  });


  describe('getStateMessage', () => {
    var lightItem, lifxItem;
    beforeEach((done) => {
      lifxItem = new LifxEmulator();
      lightItem = new LifxLight(defaultID, lifxItem, true);
      lightItem.initialize((err) => {
        if (err)
          return done(err);
        lightItem.stop();
        done();
      });
    });
    afterEach(() => {
      lightItem = null;
      lifxItem = null;
    });

    it('getStateMessage', (done) => {
      var tmp = lightItem.getStateMessage();
      expect(tmp.id).to.equal(defaultID);
      done();
    });
  });


  describe('pollChanges', () => {
    var lightItem, lifxItem;
    beforeEach((done) => {
      lifxItem = new LifxEmulator();
      lightItem = new LifxLight(defaultID, lifxItem, true);
      lightItem.initialize((err) => {
        if (err)
          return done(err);
        lightItem.stop();
        done();
      });
    });
    afterEach(() => {
      lightItem = null;
      lifxItem = null;
    });

    it('Basic test', (done) => {
      lightItem.pollChanges((err) => {
        done(err);
      });
    });
  });

  describe('setReachable', () => {
    var lightItem, lifxItem;
    beforeEach((done) => {
      lifxItem = new LifxEmulator();
      lightItem = new LifxLight(defaultID, lifxItem, true);
      lightItem.initialize((err) => {
        if (err)
          return done(err);
        lightItem.stop();
        done();
      });
    });
    afterEach(() => {
      lightItem.stop();
      lightItem = null;
      lifxItem = null;
    });

    it('false', (done) => {
      lightItem.setReachable(false);

      done();
    });

    it('false', (done) => {
      lightItem.setReachable(false);
      
      lightItem.pollChanges = chai.spy();

      lightItem.setReachable(true);
      expect(lightItem.pollChanges).to.have.been.called();
      done();
    });

  });

  describe('IR Support: Error Handling', () => {
    it('getMaxIR init error', (done) => {
      var lightItem, lifxItem;
      lifxItem = new LifxEmulator();
      lifxItem._getHWVerData.productFeatures.infrared = true;

      // Emulate error message from getMaxIR
      lifxItem.getMaxIR = function(callback) {
        callback(new Error('test'));
      };

      lightItem = new LifxLight(lifxItem.id, lifxItem, {});
      lightItem.initialize((err) => {
        if (err)
          return done(err);
        
        expect(lightItem.info.getMaxIR_Error).to.be.true;
        lightItem.stop();

        done();
      });
    });


    it('getMaxIR poll error', (done) => {
      var lightItem, lifxItem;
      lifxItem = new LifxEmulator();
      lifxItem._getHWVerData.productFeatures.infrared = true;

      // Initialize can call getMaxIR
      lifxItem.getMaxIR = function(callback) {
        callback(null, {brightness: 33});
      };

      lightItem = new LifxLight(lifxItem.id, lifxItem, {});
      lightItem.initialize((err) => {
        if (err)
          return done(err);

        expect(lightItem.info.maxIRLevel).to.equal(33);
        expect(lightItem.info.getMaxIR_Error).to.be.false;

        // Poll will generate error
        lightItem.getMaxIR = function(callback) {
          callback(new Error('test'));
        };

        lightItem.stop();
        lightItem.pollChanges((err) => {
          done(err);
        })
      });
    });
  });


  describe('IR Support', () => {
    var lightItem, lifxItem;
    beforeEach((done) => {
      lifxItem = new LifxEmulator();
      lifxItem._getHWVerData.productFeatures.infrared = true;

      lifxItem.getMaxIR = function(callback) {
        callback(null, { brightness: 33 });
      };

      lightItem = new LifxLight(lifxItem.id, lifxItem, {});
      lightItem.initialize((err) => {
        if (err)
          return done(err);
        lightItem.stop();
        done();
      });
    });
    afterEach(() => {
      lightItem = null;
      lifxItem = null;
    });

    it('getStateMessage', (done) => {
      var ret = lightItem.getStateMessage();
      expect(ret.maxIR).to.equal(33);
      done();
    });

    it('setColor', (done) => {
      lifxItem.color = chai.spy();
      lifxItem.on    = chai.spy();
      lifxItem.off   = chai.spy();
      lifxItem.maxIR = chai.spy();

      lightItem.setColor({maxIR: 66});

      expect(lifxItem.on).not.to.have.been.called();
      expect(lifxItem.off).not.to.have.been.called();
      expect(lifxItem.color).not.to.have.been.called();

      expect(lifxItem.maxIR).to.have.been.called();
      expect(lifxItem.maxIR).to.have.been.called.with.exactly(66);
      done();
    });

    it('pollChanges', (done) => {
      lightItem.pollChanges((err) => {
        done(err);
        
      });

    });
  });
});

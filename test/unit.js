const { expect } = require('code');
const Lab = require('lab');
const lab = exports.lab = Lab.script();
const TwentyThree = require('../lib/visualplatform');
const sinon = require('sinon');

sinon.stub(console, 'log');
sinon.stub(console, 'error');

lab.experiment('Unit test of library', () => {
  const vp = new TwentyThree();

  lab.test('tryParse handles status ok correctly', () => {
    const checkResponse = (response) => {
      expect(response.status).to.equal('ok');
    }
    vp.tryParse({ status: 'ok' }, checkResponse, checkResponse);
  });

  lab.test('tryParse handles status error correctly', () => {
    const checkResponse = (response) => {
      console.log(response);
      expect(response).to.equal('Error parsing response');
    }
    vp.tryParse({ status: 'error' }, checkResponse, checkResponse);
  });

  lab.test('tryParse handles html response with grace', () => {
    const checkResponse = (response) => {
      expect(response).to.equal('Error parsing response');
    };
    vp.tryParse('<html></html>', checkResponse, checkResponse);
  });
});

const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const url = require('url');
const querystring = require('querystring');
const mime = require('mime-types');
const fs = require('fs');
const rest = require('restler');

module.exports = class Visualplatform {
  constructor(domain, key, secret, callback_url) {
    this.serviceDomain = domain;
    this.consumer_key = key;
    this.consumer_secret = secret;
    this.callback_url = callback_url||'';

    // Map entire Visualplatform API
    // Map cached endpoints for saving resources spent on api requests
    // Build functions for each Visualplatform API method
    for (const method of this.constructor.methods) {
      this[method] = (function(method){
        return function (data,access_token,access_secret) {
          data = data||{};
          access_token = access_token||'';
          access_secret = access_secret||'';
          return this.call(method, data, access_token, access_secret);
        }
      })(method);

      // Create sub-objects for the different API namespaces
      const camelizedMethod = method.replace(/-(.)/g, function(_,$1){
        return $1.toUpperCase();
      });

      const s = camelizedMethod.split('/').slice(2);
      const x = [];

      for (const c of s) {
        x.push(c);
        if (!this[x.join('.')]) this[x.join('.')] = {};
      }

      // Create an alias for the method (both $.album.list and $['album.list'])
      if(x.length > 0) {
        this[x.join('.')][s[s.length-1]] = this[method];
      } else {
        this[s[s.length-1]] = this[method];
      }
      this[s.join('.')] = this[method];
    }

    this.call = this.call.bind(this);
    this.handleSuccess = this.handleSuccess.bind(this);
    this.handleErr = this.handleErr.bind(this);
  }

  static get methods() {
    return require('./static/endpoints');
  }

  static get cached() {
    return require('./static/cached.json');
  }

  static get uploads() {
    return require('./static/uploads.json');
  }

  /* API WEB SERVICE API */
  call(method, data, access_token, access_secret) {

    const oauthModule = OAuth({
      consumer: { key: this.consumer_key, secret: this.consumer_secret },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1',`${key}${access_secret}`).update(base_string).digest('base64')
      }
    });

    // Handle arguments
    return new Promise((fulfill, reject) => {
      data = data||{};
      data['format'] = 'json';
      data['raw'] = '1';
      access_token = access_token||'';
      access_secret = access_secret||'';

      const isGET = (data.requestMethod == 'GET' && (!data.include_unpublished_p || data.include_unpublished_p == 0) && this.constructor.cached.indexOf(method) > -1);
      const isUpload = this.constructor.uploads.find(function(i) { return i.name === method });
      let args = Object.assign({}, data);

      if (!isGET) {
        // Add oauth_token to request
        args.oauth_token = access_token;
      } else {
        // Remove request method from data, since it has no effect on api calls
        delete args.requestMethod;
      }

      const reqUrl = `https://${this.serviceDomain}${method}${isUpload && !isGET ? '' : `?${querystring.stringify(args)}`}`;

      if (isGET) {
        // Set up the request with callbacks
        rest.get(reqUrl)
          .on('success', this.handleSuccess(fulfill, reject))
          .on('fail', this.handleErr(fulfill, reject))
          .on('error', this.handleErr(fulfill, reject))
          .on('timeout', this.handleErr(fulfill, reject));

      } else {
        // Handle file for upload
        if (isUpload && data[isUpload.property] !== undefined) {
          const file = rest.file(
            data[isUpload.property].path,
            null,
            fs.statSync(data[isUpload.property].path).size,
            null,
            mime.lookup(data[isUpload.property].path)
          );
          data[isUpload.property] = file;

          delete args[isUpload.property];
        }

        // Sign request with oauth header
        const authHeader = oauthModule.toHeader(oauthModule.authorize({
          url:reqUrl,
          method: 'POST',
          data: isUpload ? { oauth_token: access_token } : data,
        }), {
          key: access_token,
          secret: access_secret
        });
        authHeader.Authorization += ', oauth_token="' + access_token + '"';

        // Set up the request with callbacks
        rest.post(reqUrl, {
            data:data,
            multipart: isUpload ? true : false,
            headers: authHeader
          })
          .on('success', this.handleSuccess(fulfill, reject))
          .on('fail', this.handleErr(fulfill, reject))
          .on('error', this.handleErr(fulfill, reject))
          .on('timeout', this.handleErr(fulfill, reject));
      }
    });
  }


  handleSuccess(fulfill, reject) {
    return (res) => {
      let data;
      
      // Use try/catch to avoid malformed JSON-responses
      try {
        data = JSON.parse(res);
      }
      catch (e) {
        console.error('JSON parse error, will try fixing it', e);
        if (res[0] === '{' && res[res.length-1] === '}') {
          res = res.replace(/\\n/g, "\\n")
              .replace(/\\'/g, "\\'")
              .replace(/\\"/g, '\\"')
              .replace(/\\&/g, "\\&")
              .replace(/\\r/g, "\\r")
              .replace(/\\t/g, "\\t")
              .replace(/\\b/g, "\\b")
              .replace(/\\f/g, "\\f");

          res = res.replace(/[a-z]+_[0-9]+:/g, '"$&":');
          // remove non-printable and other non-valid JSON chars
          res = res.replace(/[\u0000-\u001F]+/g,"");

          res = res.replace(/\u2013|\u2014/g, "-"); // Removing Em Dash
          try {
            data = JSON.parse(res);
          }
          catch(e) {
            return reject(e);
          }
        }
      }

      // Status might not be ok, even though the request went through
      if (data.status && !data.status.toLowerCase() == 'ok') {
        return reject(new Error(data.message));
      }
      else {
        if (data.endpoint === '/api/concatenate') {
          let photos = [];
          for (const item in data) {
            photos.push(...data[item].photos);
            delete data[item];
          }
          data.photos = photos;
        }
        return fulfill(data);
      }
    }
  }

  handleErr(fulfill, reject) {
    return (res) => {
      // Use try/catch to avoid malformed JSON-responses
      try {
        res = JSON.parse(res);
        // If response is object, parse and return err, if response is a number it's a timeout
        if (typeof res == Object) {
          return reject(new Error(res.message));
        } else if (!isNaN(res)) {
          return reject(new Error('Timeout: ' + res));
        } else {
          return reject(new Error(res));
        }
      }
      catch(e) {
        console.error('JSON parse error', e);
        return reject(e);
      }
    }
  }
};


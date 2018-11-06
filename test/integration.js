require('dotenv').config();
const { expect } = require('code');
const _ = require('lodash');
const fs = require('fs');
const Lab = require('lab');
const lab = exports.lab = Lab.script();
const Moment = require('moment');
const TwentyThree = require('../lib/visualplatform');
const sinon = require('sinon');

const config = {
  domain: process.env.DOMAIN,
  consumerKey: process.env.CONSUMER_KEY,
  consumerSecret: process.env.CONSUMER_SECRET,
  accessToken: process.env.ACCESS_TOKEN,
  accessSecret: process.env.ACCESS_SECRET,
  testImage: process.env.TEST_IMAGE,
  testMedia: process.env.TEST_MEDIA,
  testAction: process.env.TEST_ACTION
};

const checkConfig = () => {
  for (const prop of Object.values(config)) {
    if (prop === undefined) {
      return true;
    }
    return false;
  }
  return false;
};

if (checkConfig() === true) {
  console.log('Missing necessary config options, will skip integration tests');
}

lab.experiment('Integration test of API', { skip: checkConfig() }, () => {

  const vp = new TwentyThree(config.domain, config.consumerKey, config.consumerSecret);

  let testAlbum = {
    title: 'TestAlbum',
    description: 'Test of album creation'
  };

  let testPhoto = {
    title: 'TestPhoto',
    description: 'Test of photo creation'
  };

  let testSections = [
    {
      start_time: '0',
      title: 'Default section',
      description: 'Default section description'
    },
    {
      start_time: '5',
      title: 'Hello starter section',
      description: 'Description for first section'
    },
    {
      start_time: '34',
      title: 'Hello next section',
      description: 'Description for second section'
    }
  ];

  let testActions = [
    {
      start_time: -1,
      end_time: -1,
      type: 'audioad',
      title: 'Test pre spot',
      notes: 'Test note for spot'
    },
    {
      start_time: 2,
      end_time: 2,
      type: 'audioad',
      title: 'Test post spot',
      notes: 'Test note for spot'
    }
  ];

  let responseAlbum = null;

  lab.test('creates album on /album/create', { timeout: 30000 }, async () => {

    const response = await vp['/api/album/create'](testAlbum, config.accessToken, config.accessSecret);

    responseAlbum = _.pick(response.album, 'album_id', 'token');
    testPhoto.album_id = responseAlbum.album_id;

    expect(response.status).to.equal('ok');

  });

  lab.test('reads album on on /album/list', async () => {

    testAlbum = _.merge(responseAlbum, {
      title: testAlbum.title,
      content: testAlbum.description
    });

    const response = await vp['/api/album/list'](_.pick(responseAlbum, 'album_id', 'token'), config.accessToken, config.accessSecret);

    const pickedObject = _.pick(response.album,
        'title',
        'album_id',
        'content',
        );

    expect(_.pick(testAlbum, 'title', 'album_id', 'content')).to.equal(pickedObject);
  });

  lab.test('updates album on /album/update', async () => {
    testAlbum.title = 'New Test Album';

    const response = await vp['/api/album/update'](_.pick(testAlbum, 'title', 'album_id'), config.accessToken, config.accessSecret);

    expect(response.status).to.equal('ok');

    const check = await vp['/api/album/list'](_.pick(testAlbum, 'album_id'), config.accessToken, config.accessSecret);

    const pickedObject = _.pick(check.album,
        'title',
        'album_id',
        'content',
        'token'
        );

    expect(testAlbum).to.equal(pickedObject);
  });

  lab.test('gets podcast metadata on /podcast/get-metadata', async () => {

    const response = await vp['/api/podcast/get-metadata']({
      object_id: testAlbum.album_id
    }, config.accessToken, config.accessSecret);

    expect(response.podcast.title).to.equal(testAlbum.title);
  });

  lab.test('sets podcast metadata and icon on /podcast/set-metadata', async () => {
    const response = await vp['/api/podcast/set-metadata']({
      icon: fs.createReadStream(config.testImage),
      object_id: testAlbum.album_id,
      title: 'Podcast Title'
    }, config.accessToken, config.accessSecret);

    expect(response.status).to.equal('ok');
  });

  lab.test('gets podcast metadata on /podcast/get-metadata', async () => {

    const response = await vp['/api/podcast/get-metadata']({
      object_id: testAlbum.album_id
    }, config.accessToken, config.accessSecret);

    console.log(response);

    expect(response.podcast.title).to.equal('Podcast Title');
  });

  lab.test('upload media on /photo/upload', { timeout: 30000 }, async () => {

    const response = await vp['/api/photo/upload']({
      file: fs.createReadStream(config.testMedia),
      album_id: testAlbum.album_id,
      title: testPhoto.title,
      description: testPhoto.description,
      publish_date: Moment().add(1, 'days').format()
    }, config.accessToken, config.accessSecret);

    if (_.get(response, 'upload')) {
      testPhoto = _.merge(testPhoto, response.upload);
    }

    expect(response.status).to.equal('ok');

  });

  lab.test('upload thumbnail on /photo/replace', { timeout: 30000 }, async () => {

    const response = await vp['/api/photo/replace']({
      file: fs.createReadStream(config.testImage),
      photo_id: testPhoto.photo_id
    }, config.accessToken, config.accessSecret);

    testPhoto.original_size = fs.statSync(config.testImage).size.toString();

    expect(response.status).to.equal('ok');

  });

  lab.test('read photo on /photo/list', async () => {

    const response = await vp['/api/photo/list'](_.pick(testPhoto, 'photo_id', 'token'), config.accessToken, config.accessSecret);

    const checkPhoto = _.pick(response.photo, 'photo_id', 'original_size', 'title', 'tree_id', 'token', 'album_id');
    const localPhoto = _.pick(testPhoto, 'photo_id', 'original_size', 'title', 'tree_id', 'token', 'album_id');

    expect(checkPhoto).to.equal(localPhoto);
  });

  lab.test('create sections on /photo/section/create', { timeout: 30000 }, async () => {
    for (const section of testSections) {

      const response = await vp['/api/photo/section/create']({
        token: testPhoto.token,
        photo_id: testPhoto.photo_id,
        ...section
      }, config.accessToken, config.accessSecret);

      console.log(response);

      section.section_id = response.album.section_id;
      section.thumbnail_photo_id = response.album.thumbnail_photo_id;

      expect(_.pick(response.album, 'start_time', 'title', 'description', 'section_id', 'thumbnail_photo_id')).to.equal(section);
    }
  });

  lab.test('update sections on /photo/section/update', { timeout: 30000 }, async () => {
    const section = _.last(testSections);
    section.title = 'Changed section title';

    const response = await vp['/api/photo/section/update']({
      photo_id: testPhoto.photo_id,
      ...section
    }, config.accessToken, config.accessSecret);

    expect(response.status).to.equal('ok');
    expect(response.section).to.equal({});
  });

  lab.test('read sections on /photo/section/list', { timeout: 30000 }, async () => {
    const response = await vp['/api/photo/section/list']({
      photo_id: testPhoto.photo_id,
      token: testPhoto.token
    }, config.accessToken, config.accessSecret);

    const listedSections = response.sections.map(s => {
      return _.pick(s, 'section_id', 'start_time', 'title', 'description', 'thumbnail_photo_id');
    });

    for (const index in listedSections) {
      const s = listedSections[index];
      expect(s).to.equal(testSections[index]);
    }

    expect(response.status).to.equal('ok');
  });

  lab.test('update section thumbnail on /photo/section/set-thumbnail', { timeout: 30000 }, async () => {
    const section = _.last(testSections);

    const thumbResponse = await vp['/api/photo/section/set-thumbnail']({
      file: fs.createReadStream(config.testImage),
      section_id: section.section_id,
      photo_id: testPhoto.photo_id
    }, config.accessToken, config.accessSecret);

    expect(thumbResponse.status).to.equal('ok');
  });

  lab.test('adds action on /action/add', async () => {
    for (const action of testActions) {
      const response = await vp['/api/action/add']({ object_id: testPhoto.photo_id, ...action }, config.accessToken, config.accessSecret);

      action.action_id = response.action.action_id;

      expect(response.status).to.equal('ok');
    }
  });

  lab.test('uploads action on /action/upload', { timeout: 30000 }, async () => {
    for (const action of testActions) {
      console.log(action);
      const response = await vp['/api/action/upload']({
        variable_name: 'audio',
        action_id: action.action_id,
        file: fs.createReadStream(config.testAction)
      }, config.accessToken, config.accessSecret);

      expect(response.status).to.equal('ok');
    }
  });

  lab.test('delete sections on /photo/section/delete', { timeout: 30000 }, async () => {
    for (const section of testSections) {

      const response = await vp['/api/photo/section/delete']({
        section_id: section.section_id,
        photo_id: testPhoto.photo_id
      }, config.accessToken, config.accessSecret);

      expect(response.status).to.equal('ok');
      expect(response.section).to.equal({});
    }
  });

  lab.test('deletes photo on /photo/delete', async () => {

    const response = await vp['/api/photo/delete']({
      photo_id: testPhoto.photo_id
    }, config.accessToken, config.accessSecret);

    expect(response.status).to.equal('ok');
  });

  lab.test('deletes album on /album/delete', { timeout: 30000 }, async () => {

    const response = await vp['/api/album/delete'](_.pick(testAlbum, 'album_id'), config.accessToken, config.accessSecret);

    expect(response.status).to.equal('ok');

    const check = await vp['/api/album/list'](_.pick(testAlbum, 'album_id'), config.accessToken, config.accessSecret);

    expect(parseInt(check.total_count)).to.equal(0);

  });

});

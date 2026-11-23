const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validJpeg } = require('../api/read-timetable.js');
const { validRef } = require('../api/notify-admin.js');

test('timetable endpoint rejects false MIME types, invalid base64 and oversized files', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0xff, 0xd9]).toString('base64');
  assert.equal(validJpeg(jpeg, 'image/jpeg'), true);
  assert.equal(validJpeg(jpeg, 'image/png'), false);
  assert.equal(validJpeg('data:image/jpeg;base64,' + jpeg, 'image/jpeg'), false);
  assert.equal(validJpeg(Buffer.from('<svg/>').toString('base64'), 'image/jpeg'), false);
  assert.equal(validJpeg(Buffer.alloc(3_000_001, 0xff).toString('base64'), 'image/jpeg'), false);
});

test('notification lookup accepts only the database reference formats', () => {
  const uuidRef = '123e4567-e89b-12d3-a456-426614174000:1795461234';
  assert.equal(validRef('booking_created', 42), true);
  assert.equal(validRef('verification_submitted', uuidRef), true);
  assert.equal(validRef('member_verification_approved', uuidRef), true);
  assert.equal(validRef('member_booking_confirmed', '42'), true);
  assert.equal(validRef('member_schedule_assigned', '42:1795461234567'), true);
  assert.equal(validRef('member_diet_plan', '42:1795461234567'), true);
  assert.equal(validRef('member_schedule_changed', '42:2026-11-25:1795461234567:123e4567'), true);
  assert.equal(validRef('booking_created', '42&select=*'), false);
  assert.equal(validRef('member_booking_confirmed', '42,43'), false);
  assert.equal(validRef('verification_submitted', uuidRef + '&limit=10'), false);
  assert.equal(validRef('unknown_event', '42'), false);
});

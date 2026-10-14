'use strict';

// Run with: node --test ui/test/node/opticalVisit.test.cjs
// Execute the real Angular service with injected HTTP doubles; no network or records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname,
    '../../app/common/domain/services/encounterService.js'), 'utf8');
const constants = {
    bahmniEncounterUrl: '/encounter', latestPublishedForms: '/forms',
    odooConnectorUrl: '/optical'
};
const observation = (uuid, value) => ({
    concept: {uuid, name: 'Optical observation'}, valueAsString: value,
    formFieldPath: 'Comprehensive Ophthalmic Examinations.1/1-0'
});
const prescription = () => [
    observation('63e75edf-38d8-4b86-8d22-6080967d4732', 'Plastic'),
    observation('3a6faca5-7037-4390-b583-69cc37175a3a', 'Single vision'),
    observation('2b100975-29bf-47d3-a08e-0b2aad2709d8', 'Blue cut'),
    observation('644ef1f3-3a5f-4ef4-a64d-b0a40b2952be', '1.51'),
    observation('e62df613-8411-49f5-a0ee-12c444398f6d', 'Yes')
];

function harness({inputVisit = null, savedVisit = 'saved-visit',
    observations = prescription(), saveError, opticalPending = false} = {}) {
    let constructor;
    vm.runInNewContext(source, {
        angular: {module: () => ({service: (name, deps) => { constructor = deps.at(-1); }})},
        Bahmni: {Common: {Constants: constants}},
        _: {isEmpty: value => !value || !value.length}
    });
    const calls = [];
    const messages = [];
    const response = {data: {
        encounterUuid: 'saved-encounter', visitUuid: savedVisit,
        encounterDateTime: 12345, observations
    }};
    const http = {
        get: async url => {
            assert.equal(url, constants.latestPublishedForms);
            return {data: []};
        },
        post: (url, body, options) => {
            calls.push({url, body: JSON.parse(JSON.stringify(body)), options});
            if (url === constants.bahmniEncounterUrl) {
                return saveError ? Promise.reject(saveError) : Promise.resolve(response);
            }
            assert.equal(url, constants.odooConnectorUrl);
            return opticalPending ? new Promise(() => {}) : Promise.resolve({data: {status: 'success'}});
        }
    };
    const service = new constructor(http, {reject: Promise.reject.bind(Promise)},
        {patientIdentifier: 'TEST-OPTICAL', currentProvider: {uuid: 'provider'}},
        {}, {get: () => null}, {showMessage: (...args) => messages.push(args)});
    const encounter = {patientUuid: 'patient-uuid', visitUuid: inputVisit,
        observations: [], providers: []};
    return {service, encounter, calls, messages, response};
}

test('null input visit uses saved encounter visit and preserves the prescription payload', async () => {
    const h = harness();
    assert.strictEqual(await h.service.create(h.encounter), h.response);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[0].body.visitUuid, null);
    assert.equal(h.calls[0].body.patientUuid, 'patient-uuid');
    assert.deepEqual(h.calls[1].body, {
        patient_id: 'TEST-OPTICAL', encounter_uuid: 'saved-encounter', visit_uuid: 'saved-visit',
        order_prescription: true, lens: {material: 'plastic', form: 'single_vision',
            surface_treatment: ['blue_cut'], refractive_index: '1.51', right_eye: {}, left_eye: {}}
    });
    assert.equal(h.calls[1].options.withCredentials, true);
    assert.ok(h.messages.some(message => message[1] === 'Optical prescription sent to Odoo successfully.'));
});

test('normal prescription retains visit, eye measurements, and optional fields', async () => {
    const h = harness({inputVisit: 'saved-visit', observations: prescription().concat([
        observation('da39fa2d-c538-4dcf-b22a-8f7f4633af71', '-1.00'),
        observation('cd2a330f-e24a-4676-8242-b8d79ef28a78', '+2.00'),
        observation('0bab5ec5-f56a-4a3a-a7f1-87fe4d8a164f', 'Test note'),
        observation('ab1b756a-43c9-4bf6-b529-969bff722f9a', 'Test frame')
    ])});
    await h.service.create(h.encounter);
    const payload = h.calls[1].body;
    assert.equal(payload.visit_uuid, 'saved-visit');
    assert.deepEqual(payload.lens.right_eye, {distance: {sph: '-1.00'}});
    assert.deepEqual(payload.lens.left_eye, {near: {sph: '+2.00'}});
    assert.equal(payload.note, 'Test note');
    assert.equal(payload.frame_recommendation, 'Test frame');
    assert.equal(Object.hasOwn(payload, 'shop_id'), false);
});

test('saved encounter visit takes precedence over stale input visit', async () => {
    const h = harness({inputVisit: 'stale-visit'});
    await h.service.create(h.encounter);
    assert.equal(h.calls[1].body.visit_uuid, 'saved-visit');
});

test('existing visit is retained when save response has no visit UUID', async () => {
    const h = harness({inputVisit: 'existing-visit', savedVisit: null});
    await h.service.create(h.encounter);
    assert.equal(h.calls[1].body.visit_uuid, 'existing-visit');
});

test('no visit in either source remains null for unchanged connector validation', async () => {
    const h = harness({savedVisit: null});
    await h.service.create(h.encounter);
    assert.equal(h.calls[1].body.visit_uuid, null);
});

test('encounter save still resolves without waiting for optical billing', async () => {
    const h = harness({opticalPending: true});
    assert.strictEqual(await h.service.create(h.encounter), h.response);
    assert.equal(h.calls.length, 2);
});

test('failed encounter save does not submit an optical prescription', async () => {
    const error = new Error('save failed');
    const h = harness({saveError: error});
    await assert.rejects(h.service.create(h.encounter), error);
    assert.equal(h.calls.length, 1);
});

test('encounter without prescription observations does not call optical billing', async () => {
    const h = harness({observations: []});
    assert.strictEqual(await h.service.create(h.encounter), h.response);
    assert.equal(h.calls.length, 1);
});

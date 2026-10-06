// v1.94: an offender's vehicles (one entry each, Impound / Tow / DNA) replace the offender's Vehicle /
// VIN / Plates boxes and the Officer's Report Vehicles list. Synthetic data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const RF = require('../js/report-fields.js');
const R = require('../js/report-pdf.js');

const text = (bytes) => Buffer.from(bytes).toString('latin1');

test('v1.94: old vehicle boxes and the Vehicles list move to the offender, without duplicates', () => {
  const d = RF.normalize({
    offendersList: [{ name: 'Rick Poe', vehicle: '2015 Honda Accord', vin: '1HGCR2F3XFA000000', plates: 'IL AB12345' }],
    vehicles: [
      { year: '2015', make: 'Honda', model: 'Accord', color: 'Black', plate: 'AB12345', state: 'IL', vin: '1HGCR2F3XFA000000', disposition: 'Impound' },
      { year: '2018', make: 'Ford', model: 'F-150', plate: 'ZZ999', state: 'IN', disposition: 'Tow', ownerName: 'Jane Roe' },
    ],
  });
  const o = d.offendersList[0];
  assert.ok(!('vehicle' in o) && !('vin' in o) && !('plates' in o));
  assert.strictEqual(o.vehicles.length, 2, 'the same car (same VIN) is kept once');
  assert.deepStrictEqual([o.vehicles[0].year, o.vehicles[0].make, o.vehicles[0].state, o.vehicles[0].plate, o.vehicles[0].disposition], ['2015', 'Honda', 'IL', 'AB12345', 'Impound']);
  assert.strictEqual(o.vehicles[1].owner, 'Jane Roe');
  assert.strictEqual(d.vehicles.length, 0);
  assert.ok(!RF.SECTIONS.find((s) => s.id === 'report').lists.includes('vehicles'));
  assert.deepStrictEqual(RF.normalize(d).offendersList[0].vehicles.length, 2, 'normalizing again adds nothing');
  assert.strictEqual(RF.vehicleLine(o.vehicles[1]), '2018 Ford F-150 · Plate IN ZZ999 · Registered Owner Jane Roe · Towed');
  assert.strictEqual(RF.vehicleLine({ make: 'Nissan', disposition: 'DNA' }), 'Nissan · DNA');
});

test('v1.94: each vehicle prints under its offender; No Vehicle prints none; no separate Vehicles block', () => {
  const d = RF.normalize({ offendersList: [
    { name: 'Rick Poe', vehicles: [{ year: '2015', make: 'Honda', plate: 'AB12345', state: 'IL', disposition: 'Impound' }, { make: 'Ford', disposition: 'DNA' }] },
    { name: 'John Doe', noVehicle: true, vehicles: [{ make: 'Kia' }] },
  ] });
  const s = text(R.build(d, {}));
  assert.ok(s.includes('(Vehicle 1: 2015 Honda') && s.includes('Impounded'));
  assert.ok(s.includes('(Vehicle 2: Ford'));
  assert.ok(!s.includes('Kia'), 'No Vehicle leaves the vehicles off');
  assert.ok(!/Impounded \/ Towed/.test(s));
});

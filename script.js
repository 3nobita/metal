'use strict';

const get = id => document.getElementById(id);

const circle = diameter => Math.PI * diameter ** 2 / 4;
const rectangle = (width, height) => width * height;
const ellipse = (width, height) => Math.PI * width * height / 4;
const polygon = (sides, acrossFlats) =>
  sides * acrossFlats ** 2 * Math.tan(Math.PI / sides) / 4;

function checkWall(smallestOutsideSize, wall) {
  if (2 * wall >= smallestOutsideSize) {
    throw new Error('Wall thickness must be less than half the smallest outside dimension.');
  }
}

function hollow(area, width, height, wall) {
  checkWall(Math.min(width, height), wall);
  return area(width, height) - area(width - 2 * wall, height - 2 * wall);
}

function angle(width, height, thickness) {
  if (thickness >= Math.min(width, height)) {
    throw new Error('Thickness must be smaller than both angle legs.');
  }
  return thickness * (width + height - thickness);
}

function flangedSection(width, height, web, flange, flanges = 2) {
  if (web >= width || flanges * flange >= height) {
    throw new Error('Check the web and flange thickness against the overall dimensions.');
  }
  return flanges * width * flange + (height - flanges * flange) * web;
}

const FLAT = ['Width', 'Thickness'];
const TUBE = ['Outer width', 'Outer height', 'Wall thickness'];
const FLANGED = ['Flange width', 'Overall height', 'Web thickness', 'Flange thickness'];
const EXACT_AREA = ['Section area'];

const profiles = {
  'Solid bars': [
    ['Round Bar', ['Diameter'], circle],
    ['Square Bar', ['Side'], side => side ** 2],
    ['Flat Bar', FLAT, rectangle],
    ['Hex Bar', ['Across flats'], flats => polygon(6, flats)],
    ['Octagonal Bar', ['Across flats'], flats => polygon(8, flats)],
    ['Half-Round Bar', ['Diameter'], diameter => circle(diameter) / 2]
  ],
  'Flat products': [
    ['Plate', FLAT, rectangle],
    ['Sheet', FLAT, rectangle]
  ],
  'Hollow sections': [
    ['Round Pipe / Tube', ['Outer diameter', 'Wall thickness'], (diameter, wall) => {
      checkWall(diameter, wall);
      return Math.PI * wall * (diameter - wall);
    }],
    ['Square Tube', ['Outer side', 'Wall thickness'],
      (side, wall) => hollow(rectangle, side, side, wall)],
    ['Rectangular Tube', TUBE,
      (width, height, wall) => hollow(rectangle, width, height, wall)],
    ['Oval Tube', ['Outer major diameter', 'Outer minor diameter', 'Wall thickness'],
      (major, minor, wall) => {
        if (minor > major) {
          throw new Error('The major diameter must be at least the minor diameter.');
        }
        return hollow(ellipse, major, minor, wall);
      }],
    ['Hexagonal Tube', ['Outer across flats', 'Wall thickness'], (flats, wall) => {
      checkWall(flats, wall);
      return polygon(6, flats) - polygon(6, flats - 2 * wall);
    }]
  ],
  'Angles': [
    ['Equal Angle', ['Leg size', 'Thickness'],
      (leg, thickness) => angle(leg, leg, thickness)],
    ['Unequal Angle', ['First leg size', 'Second leg size', 'Thickness'], angle]
  ],
  'Channels': [
    ['C-Channel', FLANGED, flangedSection],
    ['U-Channel', FLANGED, flangedSection]
  ],
  'Beams': [
    ['I-Beam', FLANGED, flangedSection],
    ['H-Beam', FLANGED, flangedSection]
  ],
  'Other profiles': [
    ['T-Section', FLANGED, (width, height, web, flange) =>
      flangedSection(width, height, web, flange, 1)],
    ['Z-Section', FLANGED, flangedSection],
    ['Hat Section', EXACT_AREA, area => area],
    ['Rail Section', EXACT_AREA, area => area],
    ['Lipped Channel', EXACT_AREA, area => area]
  ]
};

const materials = {
  'Mild steel (MS)': 7850,
  'Stainless steel 304': 7930,
  'Stainless steel 316': 8000,
  'Cast iron': 7200,
  'Aluminium 6061': 2700,
  Copper: 8960,
  Brass: 8500,
  Bronze: 8800,
  Zinc: 7140,
  Lead: 11340,
  'Titanium Grade 2': 4510,
  'Custom density': null
};

const resultLabels = {
  weight: 'Total weight',
  length: 'Length per piece',
  diameter: 'Round Bar diameter',
  pieces: 'Whole pieces'
};

const profileSelect = get('profile');
const materialSelect = get('material');
const densityInput = get('density');
const priceInput = get('price');
const modeButtons = document.querySelectorAll('[data-mode]');
const profileIndex = new Map();
const fields = new Map();
const defaults = { Diameter: 20, length: 6, quantity: 10, weight: 147.969 };
const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const priceFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR'
});

let values = { ...defaults };
let mode = 'weight';
let previousProfile = 'Round Bar';
let customDensity = '';

for (const [group, list] of Object.entries(profiles)) {
  const optionGroup = document.createElement('optgroup');
  optionGroup.label = group;

  for (const [name, dimensions, area] of list) {
    profileIndex.set(name, { dimensions, area });
    optionGroup.append(new Option(name, name));
  }

  profileSelect.append(optionGroup);
}

for (const name of Object.keys(materials)) {
  materialSelect.add(new Option(name, name));
}

function format(value, unit) {
  return unit ? numberFormat.format(value) + ' ' + unit : numberFormat.format(value);
}

function clearResult() {
  get('result-label').textContent = resultLabels[mode];
  get('result-value').textContent = '—';
  get('metrics').replaceChildren();
  get('error').hidden = true;

  document.querySelectorAll('[aria-invalid="true"]').forEach(input => {
    input.removeAttribute('aria-invalid');
  });
}

function syncDensity() {
  const preset = materials[materialSelect.value];
  densityInput.readOnly = preset !== null;
  densityInput.value = preset ?? customDensity;
}

function addField(key, label, { optional = false, whole = false } = {}) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;

  const input = document.createElement('input');
  input.type = 'number';
  input.inputMode = whole ? 'numeric' : 'decimal';
  input.step = whole ? '1' : 'any';
  input.min = whole ? '1' : '0';
  input.required = !optional;
  input.value = values[key] ?? '';

  if (optional) input.placeholder = 'Optional';

  input.addEventListener('input', () => {
    values[key] = input.value;
    clearResult();
  });

  wrapper.append(input);
  get('dimensions').append(wrapper);
  fields.set(key, { input, label });
}

function renderFields() {
  const name = profileSelect.value;
  const { dimensions } = profileIndex.get(name);

  fields.clear();
  get('dimensions').replaceChildren();
  get('result-profile').textContent = name;
  profileSelect.disabled = mode === 'diameter';

  for (const button of modeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  }

  let hint = 'Use known section area to override the dimensions.';

  if (mode === 'diameter') {
    hint = 'Diameter mode uses the total weight of solid round bars.';
  } else if (dimensions === EXACT_AREA) {
    hint = 'Enter the cross-sectional area from the supplier’s drawing or section table.';
  } else if (name === 'Oval Tube') {
    hint = 'Oval Tube uses an elliptical approximation. Use the supplier’s section area if available.';
  }

  get('profile-hint').textContent = hint;

  if (mode !== 'diameter') {
    for (const dimension of dimensions) {
      const unit = dimension === 'Section area' ? 'mm²' : 'mm';
      addField(dimension, `${dimension} (${unit})`);
    }

    if (dimensions !== EXACT_AREA) {
      addField('overrideArea', 'Known section area (mm²)', { optional: true });
    }
  }

  if (mode !== 'length') {
    addField('length', 'Length per piece (m)');
  }

  if (mode !== 'pieces') {
    addField('quantity', 'Pieces', { whole: true });
  }

  if (mode !== 'weight') {
    const label = mode === 'pieces' ? 'Available weight (kg)' : 'Total weight (kg)';
    addField('weight', label);
  }

  clearResult();
}

function validationError(input, message) {
  input.setAttribute('aria-invalid', 'true');
  throw new Error(message);
}

function readNumber(input, label, { allowZero = false, whole = false } = {}) {
  const value = input.valueAsNumber;

  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    validationError(input, `${label} must be ${allowZero ? 'zero or greater' : 'greater than zero'}.`);
  }

  if (whole && !Number.isSafeInteger(value)) {
    validationError(input, `${label} must be a whole number within the supported range.`);
  }

  return value;
}

function readField(key) {
  const { input, label } = fields.get(key);
  return readNumber(input, label, { whole: key === 'quantity' });
}

function hasValue(input) {
  return input.value !== '' || input.validity.badInput;
}

function calculate() {
  clearResult();

  try {
    const density = readNumber(densityInput, 'Density');
    const rate = hasValue(priceInput)
      ? readNumber(priceInput, 'Price per kg', { allowZero: true })
      : null;

    let length = fields.has('length') ? readField('length') : 0;
    let quantity = fields.has('quantity') ? readField('quantity') : 0;
    let totalWeight = fields.has('weight') ? readField('weight') : 0;
    let area;
    let unusedWeight = null;

    if (mode === 'diameter') {
      area = totalWeight / (density * length * quantity) * 1e6;
    } else {
      const profile = profileIndex.get(profileSelect.value);
      const override = fields.get('overrideArea');
      area = override && hasValue(override.input)
        ? readField('overrideArea')
        : profile.area(...profile.dimensions.map(readField));
    }

    const weightPerMetre = area * density / 1e6;

    if (mode === 'length') {
      length = totalWeight / (weightPerMetre * quantity);
    }

    const weightPerPiece = weightPerMetre * length;

    if (mode === 'pieces') {
      const availableWeight = totalWeight;
      const possiblePieces = availableWeight / weightPerPiece;
      const nearestInteger = Math.round(possiblePieces);
      const tolerance = Number.EPSILON * Math.abs(possiblePieces) * 2;

      quantity = Math.abs(nearestInteger - possiblePieces) <= tolerance
        ? nearestInteger
        : Math.floor(possiblePieces);

      totalWeight = quantity * weightPerPiece;
      unusedWeight = Math.max(0, availableWeight - totalWeight);
    }

    if (mode === 'weight') {
      totalWeight = weightPerPiece * quantity;
    }

    const diameter = Math.sqrt(4 * area / Math.PI);
    const cost = rate === null ? null : totalWeight * rate;

    const results = [area, length, weightPerPiece, totalWeight, diameter, cost ?? 0];
    if (!results.every(Number.isFinite) || !Number.isSafeInteger(quantity)
        || area <= 0 || length <= 0 || weightPerPiece <= 0) {
      throw new Error('These inputs are outside the supported calculation range.');
    }

    const primary = {
      weight: format(totalWeight, 'kg'),
      length: format(length, 'm'),
      diameter: format(diameter, 'mm'),
      pieces: format(quantity)
    };

    get('result-value').textContent = primary[mode];

    const metrics = [
      ['Weight per piece', format(weightPerPiece, 'kg')],
      ['Total weight', format(totalWeight, 'kg')],
      ['Length per piece', format(length, 'm')],
      ['Pieces', format(quantity)],
      ['Section area', format(area, 'mm²')],
      ['Total price', cost === null ? '—' : priceFormat.format(cost)]
    ];

    if (unusedWeight !== null) {
      metrics.push(['Unused weight', format(unusedWeight, 'kg')]);
    }

    for (const [label, value] of metrics) {
      const card = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      card.append(term, detail);
      get('metrics').append(card);
    }

    return true;
  } catch (error) {
    get('error').textContent = error.message;
    get('error').hidden = false;
    return false;
  }
}

for (const button of modeButtons) {
  button.addEventListener('click', () => {
    const nextMode = button.dataset.mode;
    if (nextMode === mode) return;

    if (nextMode === 'diameter') {
      previousProfile = profileSelect.value;
      profileSelect.value = 'Round Bar';
    } else if (mode === 'diameter') {
      profileSelect.value = previousProfile;
    }

    mode = nextMode;
    renderFields();
  });
}

profileSelect.addEventListener('change', () => {
  delete values.overrideArea;
  renderFields();
});

materialSelect.addEventListener('change', () => {
  syncDensity();
  clearResult();
});

densityInput.addEventListener('input', () => {
  customDensity = densityInput.value;
  clearResult();
});

priceInput.addEventListener('input', clearResult);

get('calculator').addEventListener('submit', event => {
  event.preventDefault();

  if (!calculate()) {
    get('calculator').querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  if (matchMedia('(max-width: 820px)').matches) {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    get('results-title').focus({ preventScroll: true });
    get('results').scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start'
    });
  }
});

function reset() {
  values = { ...defaults };
  mode = 'weight';
  previousProfile = 'Round Bar';
  customDensity = '';
  profileSelect.value = 'Round Bar';
  materialSelect.selectedIndex = 0;
  priceInput.value = 60;
  syncDensity();
  renderFields();
  calculate();
}

get('reset').addEventListener('click', reset);
reset();

const profileIcons = {
  'Round Bar': 'M32 8a16 16 0 1 0 0 32 16 16 0 1 0 0-32Z',
  'Square Bar': 'M16 8h32v32H16Z',
  'Flat Bar': 'M8 17h48v14H8Z',
  'Hex Bar': 'M20 8h24l10 16-10 16H20L10 24Z',
  'Octagonal Bar': 'M22 8h20l8 8v16l-8 8H22l-8-8V16Z',
  'Half-Round Bar': 'M12 34a20 20 0 0 1 40 0Z',
  Plate: 'M6 15h52v18H6Z',
  Sheet: 'M6 22h52v4H6Z',
  'Round Pipe / Tube':
    'M32 6a18 18 0 1 0 0 36 18 18 0 1 0 0-36Z M32 12a12 12 0 1 0 0 24 12 12 0 1 0 0-24Z',
  'Square Tube': 'M14 6h36v36H14Z M20 12h24v24H20Z',
  'Rectangular Tube': 'M6 10h52v28H6Z M12 16h40v16H12Z',
  'Oval Tube':
    'M6 24a26 16 0 1 0 52 0 26 16 0 1 0-52 0Z M12 24a20 10 0 1 0 40 0 20 10 0 1 0-40 0Z',
  'Hexagonal Tube': 'M20 6h24l12 18-12 18H20L8 24Z M23 12h18l8 12-8 12H23l-8-12Z',
  'Equal Angle': 'M15 8h7v25h25v7H15Z',
  'Unequal Angle': 'M9 12h7v22h39v7H9Z',
  'C-Channel': 'M14 6h36v7H21v22h29v7H14Z',
  'U-Channel': 'M10 9h7v24h30V9h7v31H10Z',
  'I-Beam': 'M15 6h34v7H36v22h13v7H15v-7h13V13H15Z',
  'H-Beam': 'M8 6h48v8H37v20h19v8H8v-8h19V14H8Z',
  'T-Section': 'M10 6h44v8H36v28h-8V14H10Z',
  'Z-Section': 'M30 6h24v7H37v29H10v-7h20Z',
  'Hat Section': 'M7 35h11l6-24h16l6 24h11v6H41l-6-24h-6l-6 24H7Z',
  'Rail Section': 'M19 6h26v10H36v18h16v8H12v-8h16V16h-9Z',
  'Lipped Channel': 'M12 6h40v14h-6v-8H18v24h28v-8h6v14H12Z'
};

const calculatorDialog = get('profile-calculator');
const gallery = get('profile-gallery');
const svgNamespace = 'http://www.w3.org/2000/svg';

for (const name of profileIndex.keys()) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'profile-tile';
  tile.setAttribute('aria-haspopup', 'dialog');

  const icon = document.createElementNS(svgNamespace, 'svg');
  icon.setAttribute('viewBox', '0 0 64 48');
  icon.setAttribute('aria-hidden', 'true');

  const shape = document.createElementNS(svgNamespace, 'path');
  shape.setAttribute('d', profileIcons[name]);
  shape.setAttribute('fill', 'currentColor');
  shape.setAttribute('fill-rule', 'evenodd');
  icon.append(shape);

  const label = document.createElement('span');
  label.textContent = name;
  tile.append(icon, label);

  tile.addEventListener('click', () => {
    mode = 'weight';
    previousProfile = name;
    delete values.overrideArea;
    profileSelect.value = name;
    renderFields();

    calculatorDialog.scrollTop = 0;
    calculatorDialog.showModal();
  });

  gallery.append(tile);
}

// Keep the dialog title in sync when the profile or mode changes.
const originalRenderFields = renderFields;
renderFields = function () {
  originalRenderFields();
  get('calculator-title').textContent = profileSelect.value;
};

get('close-calculator').addEventListener('click', () => {
  calculatorDialog.close();
});
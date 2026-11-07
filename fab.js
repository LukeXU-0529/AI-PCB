import { cities, companies, companyMetrics, sites, sources } from './fab-data.js';

const labels = { fab: '晶圆制造', osat: '封装测试' };
const byId = (id) => document.getElementById(id);
const controls = { company: byId('company'), status: byId('status'), search: byId('search'), city: byId('city') };
const segments = [...byId('segments').querySelectorAll('button')];
const collator = new Intl.Collator('zh-CN');
const svgNamespace = 'http://www.w3.org/2000/svg';
let segment = '';
let selectedCity = '上海';

function node(tag, content, className) {
  const element = document.createElement(tag);
  if (content != null) element.append(content);
  if (className) element.className = className;
  return element;
}

function svg(tag, attributes, content) {
  const element = document.createElementNS(svgNamespace, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (content != null) element.textContent = content;
  return element;
}

function sourceLink(key) {
  const [name, url] = sources[key];
  const link = node('a', name, 'source');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function metric([type, value, period, note]) {
  const line = node('div', node('span', value, 'metric-value'), 'metric');
  line.append(node('span', `${type} · ${period}${note ? ` · ${note}` : ''}`, 'metric-note'));
  return line;
}

function setOptions(select, first, options, current = select.value) {
  select.replaceChildren(...[[ '', first ], ...options].map(([value, label]) => new Option(label, value)));
  select.value = options.some(([value]) => value === current) ? current : '';
}

function renderSummary(filtered) {
  const totals = [
    ['家企业', new Set(filtered.map((row) => row[0])).size],
    ['座城市', new Set(filtered.map((row) => row[1])).size],
    ['条基地 / 项目', filtered.length],
  ];
  byId('summary').replaceChildren(...totals.map(([label, count]) => {
    const item = node('div', node('dt', label));
    item.append(node('dd', count));
    return item;
  }));
}

function renderLocation(citySites) {
  if (!citySites.length) {
    byId('location').replaceChildren(node('p', selectedCity ? '该城市暂无匹配记录。' : '在地图上点击城市，或从上方列表选择。'));
    return;
  }
  byId('location').replaceChildren(...citySites.map(([company, , name, process, status, source, metrics = [], note]) => {
    const card = node('article', node('p', `${companies[company][0]} · ${labels[companies[company][2]]}`), 'site-card');
    card.append(node('h3', name), node('p', process), node('span', status, 'status'));
    card.append(...metrics.map(metric));
    if (!metrics.length) card.append(node('p', '本记录暂无可列示的单厂产能。'));
    if (note) card.append(node('p', note));
    card.append(sourceLink(source), ...[...new Set(metrics.map((entry) => entry[4]).filter(Boolean))].map((key) => node('div', sourceLink(key))));
    return card;
  }));
  byId('location').scrollTop = 0;
}

// Place close cities apart with leader lines back to their geographic centers.
function markerPositions(cityNames) {
  const points = [];
  for (const name of cityNames) {
    const [lon, lat] = cities[name];
    const x = 52 + (lon - 73) * 9.5;
    const y = 23 + (54 - lat) * 10.9;
    let point = { x, y };
    const isClear = (candidate) => points.every((previous) => Math.hypot(candidate.x - previous.x, candidate.y - previous.y) >= 23);
    for (let radius = 20; !isClear(point) && radius <= 80; radius += 8) {
      for (let step = 0; step < 8; step += 1) {
        const angle = step * Math.PI / 4;
        const candidate = { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
        if (isClear(candidate)) { point = candidate; break; }
      }
    }
    points.push({ ...point, anchorX: x, anchorY: y, name });
  }
  return points;
}

function renderMap(grouped) {
  const domestic = [...grouped.keys()].filter((name) => cities[name]);
  const points = markerPositions(domestic);
  const lines = points.filter((point) => point.x !== point.anchorX || point.y !== point.anchorY)
    .map(({ x, y, anchorX, anchorY }) => svg('line', { x1: anchorX, y1: anchorY, x2: x, y2: y, class: 'map-leader' }));
  const markers = points.map(({ x, y, name }) => {
    const rows = grouped.get(name);
    const types = new Set(rows.map(([company]) => companies[company][2]));
    const category = types.size === 2 ? 'mixed' : types.values().next().value;
    const caption = `${name}，${rows.length} 条基地或项目`;
    const mark = svg('g', { class: `map-marker ${category}`, tabindex: 0, role: 'button', 'aria-label': caption, 'aria-pressed': 'false', 'data-city': name });
    mark.append(svg('title', {}, caption), svg('circle', { cx: x, cy: y, r: 10.5 }), svg('text', { x, y }, rows.length));
    mark.addEventListener('click', () => selectCity(name, grouped));
    mark.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectCity(name, grouped);
    });
    return mark;
  });
  byId('markers').replaceChildren(...lines, ...markers);
  const labelsLayer = svg('g', { id: 'city-labels', 'aria-hidden': 'true' });
  for (const { x, y, name } of points) {
    if (!['北京', '上海', '合肥', '广州', '重庆', '西安'].includes(name)) continue;
    labelsLayer.append(svg('text', { x, y: y - 13, class: 'map-label', 'data-city': name }, name));
  }
  byId('markers').append(labelsLayer);

  const overseas = [...grouped.keys()].filter((name) => !cities[name]);
  byId('overseas').replaceChildren(...(overseas.length ? [node('span', '境外基地')] : []), ...overseas.map((name) => {
    const button = node('button', `${name} · ${grouped.get(name).length}`);
    button.type = 'button';
    button.dataset.city = name;
    button.addEventListener('click', () => selectCity(name, grouped));
    return button;
  }));
}

function selectCity(name, grouped) {
  selectedCity = name;
  controls.city.value = name;
  for (const marker of document.querySelectorAll('.map-marker, #overseas button')) {
    marker.setAttribute('aria-pressed', String(marker.dataset.city === name));
  }
  byId('selected-city-label')?.remove();
  const mark = [...document.querySelectorAll('.map-marker')].find((item) => item.dataset.city === name);
  if (mark && ![...byId('city-labels').children].some((label) => label.dataset.city === name)) {
    const circle = mark.querySelector('circle');
    byId('city-labels').append(svg('text', { id: 'selected-city-label', x: circle.getAttribute('cx'), y: Number(circle.getAttribute('cy')) - 13, class: 'map-label' }, name));
  }
  renderLocation(grouped.get(name) ?? []);
}

function renderCompanies(filtered) {
  const active = new Set(filtered.map(([company]) => company));
  const cards = companyMetrics.filter(([company]) => active.has(company)).map(([company, source, metrics]) => {
    const card = node('article', node('h3', companies[company][0]), 'company-card');
    card.append(...metrics.map(metric), sourceLink(source), ...[...new Set(metrics.map((entry) => entry[4]).filter(Boolean))].map((key) => node('div', sourceLink(key))));
    return card;
  });
  byId('company-metrics').replaceChildren(...(cards.length ? cards : [node('p', '当前筛选暂无公司汇总数字，请查看基地与项目明细。')]));
}

function renderTable(filtered) {
  const rows = filtered.map(([company, city, name, process, status, source, metrics = [], note]) => {
    const [companyName, code, type] = companies[company];
    const companyCell = node('td', companyName);
    companyCell.append(node('small', `${labels[type]} · ${code}`, 'metric-note'));
    const nameCell = node('td', name);
    if (note) nameCell.append(node('small', note, 'metric-note'));
    const metricCell = node('td');
    metricCell.append(...(metrics.length ? metrics.map(metric) : [node('small', '暂无可列示产能')]));
    const sourceCell = node('td', sourceLink(source));
    for (const key of new Set(metrics.map((entry) => entry[4]).filter(Boolean))) sourceCell.append(node('div', sourceLink(key)));
    const row = node('tr', companyCell);
    row.append(node('td', city), nameCell, node('td', process), node('td', node('span', status, 'status')), metricCell, sourceCell);
    return row;
  });
  if (!rows.length) {
    const empty = node('td', '暂无匹配记录，请调整筛选条件。');
    empty.colSpan = 7;
    rows.push(node('tr', empty));
  }
  byId('table-count').textContent = `${filtered.length} 条记录`;
  byId('sites').replaceChildren(...rows);
}

function render() {
  const query = controls.search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = sites.filter(([company, city, name, process, status]) => {
    const [companyName, code, type] = companies[company];
    return (!segment || type === segment)
      && (!controls.company.value || controls.company.value === company)
      && (!controls.status.value || controls.status.value === status)
      && query.every((part) => `${companyName} ${code} ${city} ${name} ${process}`.toLowerCase().includes(part));
  });
  const grouped = new Map();
  for (const row of filtered) {
    const city = row[1];
    if (!grouped.has(city)) grouped.set(city, []);
    grouped.get(city).push(row);
  }
  const cityOptions = [...grouped.keys()].sort(collator.compare).map((city) => [city, `${city} · ${grouped.get(city).length} 条`]);
  const city = grouped.has(selectedCity) ? selectedCity : cityOptions[0]?.[0] ?? '';
  setOptions(controls.city, '选择城市', cityOptions, city);
  controls.city.onchange = () => selectCity(controls.city.value, grouped);
  renderSummary(filtered);
  renderMap(grouped);
  selectCity(city, grouped);
  renderCompanies(filtered);
  renderTable(filtered);
}

function updateCompanyOptions() {
  const options = Object.entries(companies).filter(([, company]) => !segment || company[2] === segment).map(([id, [name]]) => [id, name]);
  setOptions(controls.company, '全部企业', options);
}

for (const button of segments) {
  button.addEventListener('click', () => {
    segment = button.value;
    for (const item of segments) item.setAttribute('aria-pressed', String(item === button));
    updateCompanyOptions();
    render();
  });
}
setOptions(controls.status, '全部状态', [...new Set(sites.map((row) => row[4]))].map((status) => [status, status]));
updateCompanyOptions();
controls.company.addEventListener('change', render);
controls.status.addEventListener('change', render);
controls.search.addEventListener('input', render);
render();

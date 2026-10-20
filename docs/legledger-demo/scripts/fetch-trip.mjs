#!/usr/bin/env node
/**
 * 腿账 LegLedger · 路书数据抓取
 *
 * 作用：把「景点坐标 + 步行路径 + 海拔」抓下来，算成一份可复算的 JSON。
 * 用法：AMAP_KEY=你的高德Web服务key node scripts/fetch-trip.mjs
 * 输出：data/day3.json（页面上的数字以此为准）
 *
 * 数据来源：
 *   - 高德 Web 服务 API（POI 搜索 / 步行路径规划）
 *   - OpenTopoData SRTM 30m（海拔，公开免费，无需 key）
 *
 * 说明：高德 MCP 与这里的 REST 调用拿到的是同一套数据。
 * MCP 适合让 agent 边聊边查，REST 适合批量抓一次存下来。演示读本地 JSON 最稳。
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../data/day3.json");

const AMAP = "https://restapi.amap.com/v3";
const ELEV = "https://api.opentopodata.org/v1/srtm30m";

const KEY = process.env.AMAP_KEY;
const CITY = "重庆";
const HOURS_OUTSIDE = 12.5;
const AGE_FACTOR = 1.3;

// 景区内步行估算（路径 API 只算景点之间，景区里面要走的路单独加）
const SPOTS = [
  { query: "南山一棵树观景台", label: "南山一棵树", insideKm: 1.5 },
  { query: "黄葛古道", label: "黄葛古道", insideKm: 6.0 },
  { query: "老君洞道观", label: "老君洞", insideKm: 1.0 },
  { query: "鹅岭二厂", label: "鹅岭二厂", insideKm: 0.6 },
];

function fail(message) {
  console.error(`\n[失败] ${message}\n`);
  process.exit(1);
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) fail(`HTTP ${res.status}：${url}`);
  return res.json();
}

async function searchPOI(keyword) {
  const url =
    `${AMAP}/place/text?keywords=${encodeURIComponent(keyword)}` +
    `&city=${encodeURIComponent(CITY)}&offset=1&page=1&extensions=base&key=${KEY}`;
  const data = await getJSON(url);
  if (data.status !== "1") fail(`高德 POI 返回 ${data.info}：${keyword}`);
  const poi = data.pois && data.pois[0];
  if (!poi) fail(`高德找不到这个地点：${keyword}`);
  const [lng, lat] = poi.location.split(",").map(Number);
  return { name: poi.name, lng, lat };
}

async function walking(from, to) {
  const url =
    `${AMAP}/direction/walking?origin=${from.lng},${from.lat}` +
    `&destination=${to.lng},${to.lat}&key=${KEY}`;
  const data = await getJSON(url);
  if (data.status !== "1") fail(`高德路径返回 ${data.info}`);
  const path = data.route && data.route.paths && data.route.paths[0];
  if (!path) fail(`没有步行路径：${from.name} → ${to.name}`);
  const polyline = [];
  for (const step of path.steps) {
    if (!step.polyline) continue;
    for (const pair of step.polyline.split(";")) {
      const [lng, lat] = pair.split(",").map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat)) polyline.push({ lng, lat });
    }
  }
  return {
    distanceM: Number(path.distance),
    durationS: Number(path.duration),
    polyline,
  };
}

function thin(points, max) {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

async function elevation(points) {
  const sample = thin(points, 90);
  const locations = sample.map((p) => `${p.lat},${p.lng}`).join("|");
  const url = `${ELEV}?locations=${locations}`;
  const data = await getJSON(url);
  if (data.status !== "OK") fail(`海拔接口返回 ${data.status}`);
  const values = data.results.map((r) => r.elevation);
  if (values.some((v) => v === null)) fail("海拔数据有空值，换一次采样重试");
  return values;
}

function cumulativeAscent(values) {
  let sum = 0;
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 3) sum += delta;
  }
  return sum;
}

async function main() {
  if (!KEY) fail("没有 AMAP_KEY。用法：AMAP_KEY=你的key node scripts/fetch-trip.mjs");

  console.log(`\n腿账 · 抓取 ${CITY} · Day 3\n`);

  // 1. 景点坐标
  const spots = [];
  for (const spot of SPOTS) {
    const found = await searchPOI(spot.query);
    spots.push({ ...found, label: spot.label, insideKm: spot.insideKm });
    console.log(`  POI  ${spot.label.padEnd(8)} ${found.lng},${found.lat}  (${found.name})`);
    await new Promise((r) => setTimeout(r, 250));
  }

  // 2. 相邻景点步行路径，逐段采海拔
  const legs = [];
  for (let i = 0; i < spots.length - 1; i++) {
    const from = spots[i];
    const to = spots[i + 1];
    const leg = await walking(from, to);

    // 段与段之间必须分开采样：合并会把跳跃误算成爬升
    const points =
      leg.polyline.length >= 2
        ? leg.polyline
        : [
            { lng: from.lng, lat: from.lat },
            { lng: to.lng, lat: to.lat },
          ];
    const elevs = await elevation(points);
    const legAscent = Math.round(cumulativeAscent(elevs));

    legs.push({
      from: from.label,
      to: to.label,
      distanceM: leg.distanceM,
      durationS: leg.durationS,
      ascentM: legAscent,
    });

    console.log(
      `  路径  ${from.label} → ${to.label}  ` +
        `${(leg.distanceM / 1000).toFixed(2)} km  爬升 ${legAscent} m`,
    );
    await new Promise((r) => setTimeout(r, 1200));
  }

  // 3. 汇总爬升
  const ascentM = legs.reduce((s, l) => s + l.ascentM, 0);

  // 4. 结算
  const betweenKm = legs.reduce((s, l) => s + l.distanceM, 0) / 1000;
  const insideKm = spots.reduce((s, p) => s + p.insideKm, 0);
  const totalKm = betweenKm + insideKm;
  const steps = Math.round((totalKm * 1000) / 0.75);
  const equivalentKm = totalKm + (ascentM / 100) * 0.8;

  const baseLoad =
    100 * (0.3 * (steps / 20000) + 0.4 * (ascentM / 750) + 0.3 * (HOURS_OUTSIDE / 12));
  const fatigue = Math.round(baseLoad * AGE_FACTOR);

  const result = {
    trip: `${CITY} 3 日 · Day 3`,
    generatedAt: new Date().toISOString(),
    source: {
      path: "amap /v3/direction/walking",
      poi: "amap /v3/place/text",
      elevation: "opentopodata srtm30m",
    },
    spots: spots.map((s) => ({
      label: s.label,
      name: s.name,
      lng: s.lng,
      lat: s.lat,
      insideKm: s.insideKm,
    })),
    legs,
    summary: {
      betweenKm: Number(betweenKm.toFixed(2)),
      insideKm: Number(insideKm.toFixed(2)),
      totalKm: Number(totalKm.toFixed(2)),
      steps,
      ascentM,
      equivalentKm: Number(equivalentKm.toFixed(1)),
      hoursOutside: HOURS_OUTSIDE,
      ageFactor: AGE_FACTOR,
      baseLoad: Number(baseLoad.toFixed(1)),
      fatigue,
      verdict:
        fatigue > 120
          ? "崩溃"
          : fatigue > 90
            ? "吃力"
            : fatigue > 60
              ? "偏紧"
              : "轻松",
    },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n", "utf8");

  console.log("\n  ── 结果 ──");
  console.log(`  景点间   ${result.summary.betweenKm} km`);
  console.log(`  景区内   ${result.summary.insideKm} km`);
  console.log(`  全天     ${result.summary.totalKm} km`);
  console.log(`  步数     ${result.summary.steps}`);
  console.log(`  爬升     ${result.summary.ascentM} m`);
  console.log(`  指数     ${result.summary.fatigue}  (${result.summary.verdict})`);
  console.log(`\n  已写入 ${OUT}\n`);
}

main().catch((err) => fail(err.message));

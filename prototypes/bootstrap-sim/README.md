# BOOTSTRAP — MVP Simulation Core (Phase 1 prototype)

A **headless, deterministic** stock-and-flow simulator that proves the core thesis of the
*BOOTSTRAP — From Soil to Singularity* design (see `docs/BOOTSTRAP-GDD.md`):
a civilization where **old systems never stop mattering** because every producer runs at

```
utilization = min(labor_ratio, input_ratios, deposit_ratio)
output      = nominal × utilization × outputMultiplier(tools, fertility)
```

so bottlenecks propagate backward and forward through shared **labor pools** and **material stocks**.

This is the engineering artifact the roadmap front-loads ("make-or-break sim core"). It is
**decoupled from any renderer** and runs under Node with zero dependencies.

## Run it

```bash
# Dashboard of a healthy run (settlement + factory gates both pass)
node prototypes/bootstrap-sim/run.js 500

# Same world, with a transient crop-disease shock at tick 400
node prototypes/bootstrap-sim/run.js 600 --disease

# Automated test harness (determinism, bottlenecks, gates, famine cascade, tools)
node prototypes/bootstrap-sim/test.js
```

## What it demonstrates (validated by `test.js`, 10/10)

| Test | Proves |
|------|--------|
| T1 | **Determinism** — identical runs hash-identical (balance can be automated headlessly) |
| T2 | **min() bottleneck propagation** — an ore-starved smelter reports `input:ore`; under-staffed mines report `labor:unskilled` |
| T3 | **Sustained multi-condition gates** — a gate passes only after its window, and a mid-window shock **resets** the counter (no tech-rushing) |
| T4 | **Famine cascade + traceability** — a sustained blight → food deficit → population decline → unskilled-labor loss → ore/wood shortfall → **steel collapse**, with the upstream bottleneck observable each tick |
| T5 | **Tools-as-capital** — supplied tools raise farm/mine output per laborer → higher sustainable population; tool coverage decays without a toolsmith (maintenance loop) |

## Scope (MVP = GDD §20)

Implemented: gathering, farming, soil fertility (drain/restore + blight), food storage & spoilage,
two-tier population (unskilled/skilled) with food-driven growth/starvation, education (unskilled→skilled),
housing-capped growth, finite/depleting ore, the Ore→Steel→Tools chain, tools-as-capital with wear,
and sustained multi-condition era gates.

Deliberately excluded (later phases): power grid & stability, pollution loop, logistics congestion,
multi-region map, comms/computers/AI/quantum/RSI, space. The data-driven design
(`data/*.json`) is built so these are added as new resources/buildings without engine rewrites.

## Files

- `sim.js` — the engine (`Sim` class, `tick()`, `metrics()`, `bottlenecks()`, `hash()`).
- `data/resources.json` · `data/buildings.json` · `data/scenario.json` — the **data-driven model**. Tune here.
- `run.js` — CLI dashboard. `test.js` — automated harness.

## Next engineering steps

1. Add the **power-grid layer** (capacity *and* stability) as new building fields + a `power_ratio` term in the min().
2. Add the **pollution→fertility/health** feedback loop (closes the cycle back to agriculture).
3. Add **logistics throughput** between regions (a `logistics_ratio` term).
4. Wrap the engine in a thin renderer + the dashboards from GDD §16 for the Vertical Slice.

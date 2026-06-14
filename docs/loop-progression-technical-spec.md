# Loop-Based Progression Technical Specification

This document converts the civilization-scale loop design in
[`docs/BOOTSTRAP-GDD.md`](BOOTSTRAP-GDD.md) into a programmer-facing
specification. It is intended for future implementation of a headless,
deterministic simulation that can drive a UI, a sandbox editor, and automated
balance tests.

The core design rule is:

```text
An era is not unlocked by spending points.
An era is unlocked when the current era's historical bottleneck has been
solved by a stable, surplus-producing, self-reinforcing loop.
```

The current prototype in `prototypes/bootstrap-sim/` already proves the minimum
shape: shared stocks, shared labor pools, deterministic ticks, `min()`-based
utilization, sustained gates, and traceable cascades. This spec generalizes
that pattern from Gathering through Post-RSI.

## 1. Simulation Architecture

### 1.1 Boundaries

Keep these systems separate:

| Layer | Owns | Must not own |
|---|---|---|
| Simulation core | Time, resources, population, processes, loops, gates, failures, save state | DOM, canvas drawing, pointer input |
| Renderer | Map/canvas visuals, animation, camera, particles | Authoritative economy or gate logic |
| UI shell | Dashboards, inspectors, alerts, era checklist, buttons | Hidden sim state changes |
| Content data | Era definitions, resources, buildings, loops, breakthrough rules | Imperative tick logic |
| Test harness | Deterministic scenarios, shock tests, balance assertions | Player-only UI behavior |

All loop progression code must be runnable headlessly.

### 1.2 Determinism

The sim must produce the same output for the same seed, content version, and
input timeline.

Required deterministic inputs:

- `seed`
- `contentVersion`
- `initialScenario`
- ordered player commands
- scheduled world events
- fixed `dt`

Do not use wall-clock time inside the sim. The renderer may interpolate, but
the simulation tick is fixed.

## 2. Core Data Structures

The examples below are TypeScript-shaped pseudocode. The repo may keep vanilla
JS, but the fields should remain serializable.

```ts
type EraId =
  | 'gathering'
  | 'agriculture'
  | 'storage_settlement'
  | 'craft_tools'
  | 'mining'
  | 'proto_industry'
  | 'coal_steam'
  | 'mass_production'
  | 'communication'
  | 'computer'
  | 'ai_chip'
  | 'power_server'
  | 'space'
  | 'advanced_ai'
  | 'quantum'
  | 'rsi'
  | 'post_rsi';

type ResourceId = string;
type MetricId = string;
type ProcessId = string;
type LoopId = string;

interface SimState {
  tick: number;
  dt: number;
  seed: number;
  contentVersion: string;
  currentEra: EraId;
  unlockedEras: EraId[];

  stocks: Record<ResourceId, StockState>;
  population: PopulationState;
  infrastructure: InfrastructureState;
  environment: EnvironmentState;
  knowledge: KnowledgeState;
  processes: Record<ProcessId, ProcessRuntime>;
  loops: Record<LoopId, LoopRuntime>;
  gates: Record<EraId, EraGateRuntime>;
  telemetry: TelemetryState;
  eventLog: SimEvent[];
}

interface StockState {
  amount: number;
  capacity: number;
  quality?: number;       // 0..1 for ore grade, food quality, chip yield, etc.
  spoilRate?: number;     // per tick, reduced by storage/cooling.
  reserved?: number;      // committed to queued builds or experiments.
}

interface PopulationState {
  total: number;
  cohorts: Record<string, number>; // child, adult, elder; optional for MVP.
  skills: {
    unskilled: number;
    skilled: number;
    engineer: number;
    researcher: number;
    ai_operator: number;
  };
  health: number;          // 0..1
  morale: number;          // 0..1
  literacy: number;        // 0..1
  foodDemandPerTick: number;
  housingCapacity: number;
}

interface InfrastructureState {
  logisticsCapacity: number;
  logisticsDemand: number;
  logisticsDelay: number;       // rolling average ticks.
  powerCapacity: number;
  powerDemand: number;
  gridStability: number;        // 0..1, separate from capacity.
  communicationCoverage: number;// 0..1
  computeCapacity: number;
  coolingCapacity: number;
  maintenanceBacklog: number;   // normalized 0..infinity.
}

interface EnvironmentState {
  soilFertility: number;        // global MVP or regional average.
  waterReliability: number;
  pollution: number;
  climateStress: number;
  diseasePressure: number;
  resourceDepletion: Record<ResourceId, number>;
}

interface KnowledgeState {
  observations: Record<string, number>;
  educationCapacity: number;
  researchCapacity: number;
  experimentCapacity: number;
  theory: Record<string, number>;
  bottleneckPressure: Record<string, number>;
}
```

## 3. Content Definitions

### 3.1 Resource Definition

```ts
interface ResourceDef {
  id: ResourceId;
  name: string;
  category:
    | 'natural'
    | 'food'
    | 'human'
    | 'knowledge'
    | 'material'
    | 'energy'
    | 'data_compute'
    | 'ai'
    | 'space'
    | 'quantum';
  baseCapacity?: number;
  perishable?: boolean;
  spoilRate?: number;
  qualityTracked?: boolean;
  strategic?: boolean; // show in dashboards and gate diagnostics.
}
```

### 3.2 Process Definition

A process is any recurring conversion: foraging, farming, schooling, mining,
smelting, research, power generation, AI training, launch operations, quantum
error correction.

```ts
interface ProcessDef {
  id: ProcessId;
  era: EraId;
  name: string;
  priority: number;

  inputs?: Record<ResourceId, number>;
  outputs?: Record<ResourceId, number>;
  catalysts?: Record<ResourceId, number>; // required but not consumed.

  labor?: Partial<Record<keyof PopulationState['skills'], number>>;
  powerDemand?: number;
  heatOutput?: number;
  coolingDemand?: number;
  logisticsDemand?: number;
  maintenanceDemand?: Record<ResourceId, number>;

  constraints?: ConstraintDef[];
  multipliers?: MultiplierDef[];
  externalities?: ExternalityDef[];
  improves?: ImprovementDef[];
}

interface ConstraintDef {
  id: string;
  metric: MetricId;
  min?: number;
  max?: number;
  weight?: number; // optional for soft constraints.
}

interface MultiplierDef {
  metric: MetricId;
  curve: 'linear' | 'saturating' | 'threshold' | 'inverse';
  min: number;
  max: number;
}

interface ExternalityDef {
  targetMetric: MetricId;
  deltaPerUtilizedTick: number;
  delayed?: number; // ticks before effect is visible.
}

interface ImprovementDef {
  targetProcessTag: string;
  metric: MetricId;
  deltaPerOutput?: number;
  multiplier?: number;
}
```

### 3.3 Loop Definition

Loops are content data, not hardcoded procedural checks.

```ts
interface LoopDef {
  id: LoopId;
  era: EraId;
  name: string;
  historicalBottleneck: string;
  breakthrough: string;
  primary: boolean;

  nodes: LoopNodeDef[];
  edges: LoopEdgeDef[];
  stability: LoopStabilityDef;
  failure: LoopFailureDef;
  previousEraDependencies: MetricId[];
  improvesOlderSystems: ImprovementEvidenceDef[];
}

interface LoopNodeDef {
  id: string;
  metric: MetricId;
  role: 'input' | 'production' | 'output' | 'reinforcement' | 'expansion';
  min?: number;
  max?: number;
  surplusMetric?: MetricId;
}

interface LoopEdgeDef {
  from: string;
  to: string;
  sign: 1 | -1;
  minElasticity: number; // effect strength required to count as real feedback.
  lagTicks?: number;
}

interface LoopStabilityDef {
  sustainTicks: number;
  maxBottleneckSeverity: number;
  minSurplusRatio: number;
  minResilienceScore: number;
  maxVolatility: number;
}

interface LoopFailureDef {
  triggerMetrics: MetricId[];
  regressionTargetEra?: EraId;
  stagnationPenalty: string;
}

interface ImprovementEvidenceDef {
  olderSystem: string;
  metric: MetricId;
  minImprovementRatio: number;
}
```

### 3.4 Breakthrough Definition

A breakthrough is a response to pressure, not a shop purchase.

```ts
interface BreakthroughDef {
  id: string;
  unlocksEra: EraId;
  solvesBottleneck: string;
  pressureMetrics: MetricId[];
  prerequisites: GateCondition[];
  experiments: ExperimentDef[];
  probabilityModel: 'deterministic_threshold' | 'weighted_pressure';
}

interface ExperimentDef {
  id: string;
  consumes: Record<ResourceId, number>;
  requiresMetrics: GateCondition[];
  addsObservation: string;
  failureEffects?: ExternalityDef[];
}

interface GateCondition {
  metric: MetricId;
  op: '>=' | '<=' | '>' | '<' | '==';
  value: number;
}
```

## 4. Simulation Variables

Every tick should update the following families of variables.

| Family | Variables | Why it matters |
|---|---|---|
| Stocks | amount, capacity, quality, reserved, spoilage | Resources are buffers and bottlenecks. |
| Flows | produced, consumed, imported, wasted per tick | Loops need measured throughput, not snapshots. |
| Population | total, cohorts, skills, health, morale, literacy | People are both consumers and production capacity. |
| Labor | supply by skill, demand by process, utilization ratio | Specialization gates complex eras. |
| Infrastructure | logistics, power, stability, cooling, comms, maintenance | Late-game productivity depends on non-item systems. |
| Environment | fertility, water, pollution, climate, depletion | Old ecological systems remain relevant forever. |
| Knowledge | education, observations, experiments, theory, pressure | Breakthroughs emerge from readiness plus pressure. |
| Telemetry | rolling means, volatility, bottlenecks, gate counters | Era stability is a time-window property. |
| Risk | famine, disease, blackout, overheating, misalignment | Failure must be traceable and recoverable. |

## 5. Tick Update Rules

Use a fixed step. A good MVP value is one tick = one month or one season. The
current prototype uses arbitrary ticks; the final game should label them for
player readability.

Recommended update order:

1. Apply queued player commands and scheduled events.
2. Age/spoil stocks and decay unmaintained infrastructure.
3. Update environmental state: fertility, water, pollution, disease, climate.
4. Compute population needs: food, housing, health, morale, services.
5. Compute labor supply by skill and process labor demand.
6. Compute infrastructure terms: logistics, power capacity, grid stability,
   cooling, communication coverage, maintenance availability.
7. For each process in priority order:
   - compute all constraint terms
   - set utilization to the minimum term
   - consume inputs proportional to utilization
   - produce outputs proportional to utilization and multipliers
   - record the binding bottleneck
   - apply externalities
8. Update population growth, starvation, education, migration, skill promotion.
9. Update research observations, bottleneck pressure, and experiments.
10. Update rolling telemetry windows.
11. Evaluate loops, breakthroughs, gates, failures, and regression risks.
12. Emit UI events: bottleneck changed, gate progress changed, crisis warning.

### 5.1 Utilization Rule

The general utilization formula extends the prototype's `min()` rule:

```ts
function processUtilization(process: ProcessDef, state: SimState): UtilResult {
  const terms: ConstraintTerm[] = [];

  terms.push(inputTerm(process.inputs, state.stocks));
  terms.push(catalystTerm(process.catalysts, state.stocks));
  terms.push(laborTerm(process.labor, state.population));
  terms.push(powerCapacityTerm(process.powerDemand, state.infrastructure));
  terms.push(powerStabilityTerm(process, state.infrastructure.gridStability));
  terms.push(logisticsTerm(process.logisticsDemand, state.infrastructure));
  terms.push(coolingTerm(process.coolingDemand, state.infrastructure));
  terms.push(maintenanceTerm(process.maintenanceDemand, state));
  terms.push(environmentTerm(process.constraints, state.environment));
  terms.push(knowledgeTerm(process.constraints, state.knowledge));
  terms.push(safetyTerm(process.constraints, state));

  const binding = minBy(terms, term => term.value);
  const utilization = clamp(binding.value, 0, 1);
  return { utilization, binding, terms };
}
```

Important rule: output and externalities use actual utilization. Do not produce
pollution, data, knowledge, or AI capability from an idle process.

### 5.2 Stock Update

```ts
function applyProcess(process: ProcessDef, runtime: ProcessRuntime, state: SimState) {
  const { utilization, binding } = processUtilization(process, state);
  const count = runtime.count;
  const mult = processMultiplier(process, state);

  for (const [res, rate] of entries(process.inputs)) {
    state.stocks[res].amount -= rate * count * utilization * state.dt;
  }

  for (const [res, rate] of entries(process.outputs)) {
    const made = rate * count * utilization * mult * state.dt;
    addStock(state.stocks[res], made);
    state.telemetry.flows[res].produced += made;
  }

  runtime.utilization = utilization;
  runtime.binding = binding.id;
}
```

### 5.3 Delayed Cascades

Some failures must not be instant. Delays create readable drama.

Examples:

- Famine reduces births immediately, but skilled labor loss can lag.
- Maintenance backlog slowly degrades factory yield.
- Pollution slowly lowers fertility and health.
- Grid instability immediately lowers fab yield, then damages equipment if
  repeated.
- Cooling shortage throttles servers first, then creates outage risk.
- Misalignment pressure grows with autonomy and speed, then triggers crises.

Implement delayed externalities through scheduled effects:

```ts
interface DelayedEffect {
  dueTick: number;
  targetMetric: MetricId;
  delta: number;
  cause: string;
}
```

## 6. Era Loop Stability

An era loop is stable only if all of these are true over the full sustain window:

1. Required loop nodes are active.
2. The loop produces net surplus.
3. The feedback edges have positive measured effect.
4. Bottlenecks are not severe enough to prevent continuation.
5. The loop improves at least one older system.
6. The civilization survives a small disruption without the loop collapsing.
7. The historical bottleneck for the era has enough pressure and is solved by
   the breakthrough.

### 6.1 Rolling Metric Window

```ts
interface RollingMetric {
  id: MetricId;
  samples: number[];
  mean: number;
  min: number;
  max: number;
  slope: number;
  volatility: number;
}

interface LoopRuntime {
  id: LoopId;
  closed: boolean;
  surplusRatio: number;
  bottleneckSeverity: number;
  resilienceScore: number;
  olderSystemImprovement: number;
  stabilityTicks: number;
  failedReason?: string;
}
```

### 6.2 Loop Closure Detection

```ts
function evaluateLoopClosure(loop: LoopDef, state: SimState): LoopRuntime {
  const nodeStatus = new Map<string, boolean>();

  for (const node of loop.nodes) {
    const metric = metricValue(state, node.metric);
    const aboveMin = node.min == null || metric >= node.min;
    const belowMax = node.max == null || metric <= node.max;
    nodeStatus.set(node.id, aboveMin && belowMax);
  }

  const allNodesActive = [...nodeStatus.values()].every(Boolean);
  const allEdgesWorking = loop.edges.every(edge => {
    const from = rollingMetric(state, loop.nodes.find(n => n.id === edge.from).metric);
    const to = rollingMetric(state, loop.nodes.find(n => n.id === edge.to).metric);
    const elasticity = estimateElasticity(from, to, edge.lagTicks || 0);
    return edge.sign === 1
      ? elasticity >= edge.minElasticity
      : elasticity <= -edge.minElasticity;
  });

  const surplusRatio = computeLoopSurplus(loop, state);
  const bottleneckSeverity = computeLoopBottleneckSeverity(loop, state);
  const olderSystemImprovement = computeOlderSystemImprovement(loop, state);
  const resilienceScore = estimateResilience(loop, state);

  const stable =
    allNodesActive &&
    allEdgesWorking &&
    surplusRatio >= loop.stability.minSurplusRatio &&
    bottleneckSeverity <= loop.stability.maxBottleneckSeverity &&
    olderSystemImprovement >= 1 &&
    resilienceScore >= loop.stability.minResilienceScore &&
    loopVolatility(loop, state) <= loop.stability.maxVolatility;

  return {
    id: loop.id,
    closed: stable,
    surplusRatio,
    bottleneckSeverity,
    resilienceScore,
    olderSystemImprovement,
    stabilityTicks: stable ? state.loops[loop.id].stabilityTicks + 1 : 0,
    failedReason: stable ? undefined : explainLoopFailure(loop, state),
  };
}
```

### 6.3 Resilience Test

Resilience should be cheap enough to run every few ticks. Do not fork a huge
full-world sim every frame. Use a cached, short horizon, low-frequency check.

```ts
function estimateResilience(loop: LoopDef, state: SimState): number {
  const shocks = shockSetForEra(loop.era);
  let survived = 0;

  for (const shock of shocks) {
    const clone = lightweightClone(state);
    applyShock(clone, shock);
    runHeadless(clone, shock.horizonTicks);

    const stillClosed = quickLoopCheck(loop, clone);
    const noCriticalCrash = !hasCriticalCrash(clone);
    if (stillClosed && noCriticalCrash) survived += 1;
  }

  return survived / shocks.length;
}
```

Example shocks:

- Gathering: one forage patch depleted.
- Agriculture: drought season.
- Storage: spoilage spike.
- Mining: ore grade drop.
- Steam: coal shortage.
- Power/server: grid disturbance.
- Space: failed launch.
- Quantum: cryogenic instability.
- RSI: AI autonomy spike.

### 6.4 Era Unlock Pseudocode

```ts
function updateEraGate(era: EraId, state: SimState, content: ContentDB): void {
  const gate = state.gates[era];
  const eraDef = content.eras[era];

  const primaryLoops = eraDef.requiredLoopIds.map(id => state.loops[id]);
  const loopsStable = primaryLoops.every(loop =>
    loop.closed &&
    loop.stabilityTicks >= content.loops[loop.id].stability.sustainTicks
  );

  const breakthrough = evaluateBreakthrough(eraDef.breakthroughId, state, content);
  const olderSystemsImproved = eraDef.olderSystemMetrics.every(req =>
    rollingMean(state, req.metric, req.windowTicks) >= req.minValue
  );

  const currentBottleneckSolved =
    state.knowledge.bottleneckPressure[eraDef.historicalBottleneck] >= eraDef.minPressure &&
    breakthrough.ready;

  const noCriticalFailure =
    state.telemetry.crisisLevel < eraDef.maxCrisisLevel &&
    state.telemetry.populationCollapseRisk < eraDef.maxPopulationRisk;

  const canUnlock =
    loopsStable &&
    breakthrough.ready &&
    olderSystemsImproved &&
    currentBottleneckSolved &&
    noCriticalFailure;

  if (canUnlock) {
    gate.sustainTicks += 1;
  } else {
    gate.sustainTicks = 0;
    gate.failedReason = explainGateFailure(eraDef, state, breakthrough);
  }

  if (gate.sustainTicks >= eraDef.unlockSustainTicks) {
    unlockNextEra(state, eraDef.nextEra);
  }
}
```

Do not unlock on a one-tick spike. The gate must see sustained stability.

## 7. Era Catalog

The examples are grounded in real historical and scientific bottlenecks. The
game should bend history for pacing but preserve causality: new eras emerge
because the previous system creates both the pressure and the capability.

| Era | Historical bottleneck | Breakthrough | Primary loop | Key variables | Unlock evidence |
|---|---|---|---|---|---|
| A. Gathering | Unreliable wild food, patch depletion, short planning horizon | Controlled seasonal foraging, drying, tool use | Wild food -> survival -> more gatherers -> exploration -> more food sources | wildFood, forageDepletion, preservedFood, population, exploration | Positive food balance, population not declining, fallback food buffer, fertile land scouted |
| B. Agriculture | Unreliable calories and low carrying capacity | Domestication, seeding, field management | Seeds -> fields -> harvest -> nutrition -> births/labor -> more fields | seeds, grain, fertility, water, farmLabor, births | Surplus grain over seasons, fertility non-declining, population stable, seed reserve |
| C. Storage and settlement | Spoilage, no surplus buffer, unstable labor | Pottery, granary, irrigation, permanent housing | Surplus food -> storage -> lower spoilage -> stable population -> irrigation labor -> more farmland | storageCapacity, spoilageRate, housing, irrigation, foodBuffer | Food buffer survives bad season, spoilage reduced, housing headroom, irrigated yield |
| D. Craft and tools | No specialization; weak tools; low productivity | Pottery/textiles/tools, craft specialization | Food surplus -> specialists -> tools/storage/textiles -> farm productivity -> more surplus | specialistLabor, toolCoverage, craftOutput, storageQuality | Specialist share sustained, tools replace wear, farm output per labor rises |
| E. Mining | Surface materials exhausted; weak construction and weapons | Quarrying, mining, ore sorting, early metallurgy | Surplus labor -> mining -> ore/stone/metal -> tools/building -> productivity -> deeper mining | oreGrade, mineDepth, extractionLabor, smeltYield, transportDemand | Ore throughput stable while food surplus holds; tools improve mining/farming |
| F. Proto-industrial | Manual workshop throughput, inconsistent parts | Water/wind/mechanical power, workshops, standard tools | Ore/wood -> workshops -> mechanical tools -> faster production -> better agriculture/mining/logistics -> more inputs | workshopUtil, mechanicalPower, parts, maintenance, toolCoverage | Tool coverage high, maintenance manageable, output per worker rising |
| G. Coal and steam | Low energy density and muscle-power ceiling | Coal mining, steam engines, pumps | Coal -> steam power -> mechanized production -> capital surplus -> infrastructure -> more coal/raw inputs | coalStock, steamPower, pumpCapacity, capital, pollution | Coal loop stable, steam power reserve, mines improve, pollution below farm damage |
| H. Factory and mass production | Craft variability; low scale; high unit cost | Standardized parts, assembly lines, rail logistics | Standard parts -> assembly -> cheap machines -> more factories -> logistics expansion -> more production | partStandardization, factoryUptime, railCapacity, machineTools | Factory uptime, spare parts buffer, logistics demand covered, tools cheaper |
| I. Communication | Coordination delay across cities/factories | Telegraph/telephone/radio administration | Coordination need -> network -> logistics efficiency -> lower waste -> larger civilization -> more network need | signalCoverage, adminLoad, logisticsDelay, messageLatency | Coverage sustained, delay falls, logistics waste lower, wider trade stable |
| J. Computer | Human calculation/control limits, complex logistics | Electronic computers, control systems | Precision industry -> computers -> control/logistics optimization -> factory efficiency -> better chips/tools -> better computers | compute, controlCoverage, dataQuality, cleanRoomYield | Compute improves logistics/factory yield; power stability supports electronics |
| K. AI chip | General compute insufficient; chip reliability/yield limits | Semiconductor scaling, AI accelerators | Advanced fabs -> AI chips -> ML optimization -> better fab design/yield -> stronger chips | waferPurity, lithography, aiChipOutput, fabYield, rareMaterials | AI chips produced with stable yield; optimization measurably improves fab/industry |
| L. Power grid and server | Unstable electricity, heat, insufficient compute | Grid control, datacenters, cooling infrastructure | Stable power -> data centers -> compute -> grid/logistics/research optimization -> better grid -> larger compute | gridStability, reserveMargin, coolingHeadroom, uptime, bandwidth | Uptime high, cooling positive, compute improves grid and research |
| M. Space age | Launch cost, limited observation/comms/resources | Rockets, satellites, orbital infrastructure | Advanced industry -> launches -> satellites/resources/orbital power -> better Earth industry -> more launches | launchCadence, satelliteCoverage, orbitalPower, spaceMaterials | Launch cadence stable; satellites improve comms/data; off-world resources reduce shortages |
| N. Advanced AI | Human research/optimization speed limits | AI research assistants, autonomous operations | Data+compute -> AI models -> faster research/optimization -> better chips/servers -> stronger AI | aiCapability, automationCoverage, alignment, dataScale, modelQuality | AI improves multiple older systems while alignment/trust remains stable |
| O. Quantum computing | Classical simulation and optimization limits | Qubits, error correction, cryogenics | Precision science -> QPUs -> specialized breakthroughs -> better materials/AI/research -> better QPUs | qpuYield, cryogen, errorCorrection, qCompute, exoticMaterials | Error correction stable, Q-compute improves science/AI, cryo/power reliable |
| P. RSI | Human-led AI design becomes bottleneck | AI-assisted AI research and self-design | Advanced AI -> AI research -> better AI architecture -> chip/server/power optimization -> more compute -> stronger AI | selfImprovementRate, controlCompute, simCapacity, misalignmentPressure | Positive self-improvement with bounded risk and healthy base civilization |
| Q. Post-RSI endless | Human-scale planning no longer enough; megaproject scale | Autonomous civilization optimization | Self-improving AI -> megaprojects -> planetary/space resources -> more computation -> further self-improvement | megaprojectThroughput, planetaryIndex, autonomy, riskBudget, resilience | Endless stability challenges; no final unlock, only resilience and elegance goals |

## 8. Concrete Feedback Loop Definitions

These are content examples that can become `LoopDef` data. Each loop is written
as steps, reinforcement effect, failure risk, and metrics to expose in UI/debug
tools.

| Loop | Steps | Reinforcement effect | Failure risk | Primary metrics |
|---|---|---|---|---|
| Foraging survival | Wild food -> meals -> survival -> gatherers -> wider exploration -> new food patches | More gatherers raise exploration and fallback food | Patch depletion, starvation | wildFood, exploration, population, depletion |
| Farming birth | Seeds -> fields -> harvest -> food -> nutrition -> births/labor -> more fields | Food surplus grows labor and seeded area | Drought, fertility loss | grain, nutrition, births, fertility |
| Irrigation stability | River labor -> canals -> water reliability -> harvest stability -> surplus labor -> more canals | Lower yield volatility lets labor specialize | Flood, salinization, maintenance gap | waterReliability, yieldVolatility, canalMaintenance |
| Food storage | Surplus harvest -> pottery/granary -> lower spoilage -> larger buffer -> population stability -> more surplus | Storage converts spikes into sustained carrying capacity | Spoilage, pests, capacity overflow | storageCapacity, spoilageRate, foodBuffer |
| Population specialization | Food buffer -> stable population -> specialist labor -> crafts/admin -> productivity -> larger food buffer | Surplus people become non-farm workers | Famine returns specialists to survival work | specialistShare, foodBuffer, productivity |
| Tool productivity | Metal/wood -> tools -> higher farm/mine output -> more raw inputs -> more tools | Tools act as capital that multiplies labor | Tool wear, metal shortage | toolCoverage, toolWear, outputPerLabor |
| Education and literacy | Surplus time -> schools -> literacy -> better records/research -> productivity -> more surplus time | Knowledge increases all later discovery rates | Teacher shortage, child labor pressure | literacy, schoolUtil, researchCapacity |
| Writing/accounting | Trade/tax complexity -> records -> lower loss/fraud -> higher state capacity -> bigger projects -> more complexity | Administration enables irrigation, armies, cities | Bureaucratic overload, record loss | adminLoad, accountingCoverage, taxEfficiency |
| Mining depth | Tool surplus -> mines -> ore -> better tools/supports -> deeper mines -> more ore | Metals unlock stronger production chains | Collapse, depletion, transport bottleneck | oreRate, mineDepth, oreGrade, mineSafety |
| Metallurgy | Ore+fuel -> metal -> stronger tools/weapons/buildings -> more extraction/construction -> more ore+fuel demand | Materials raise productivity and project scale | Fuel shortage, smelt yield loss | smeltYield, charcoal/coal, metalStock |
| Mechanical power | Water/wind sites -> mills -> lower manual labor -> surplus craft output -> more mechanical equipment | Non-muscle power frees workers | Site scarcity, seasonal flow | mechanicalPower, laborSaved, millUptime |
| Steam power | Coal -> steam engines -> pumps/factories -> productivity/capital -> mine expansion -> more coal | Energy density breaks muscle/water-site ceiling | Coal shortage, pollution, boiler accidents | coalStock, steamPower, reserve, pollution |
| Rail logistics | Steel+steam -> rail -> bulk transport -> lower input starvation -> larger factories/mines -> more rail demand | Transport expands economic radius | Congestion, steel shortage, accidents | railCapacity, logisticsDelay, bulkDemand |
| Mass production | Standard parts -> assembly -> cheap machines -> more factories -> more standard parts | Scale lowers unit cost and raises tool access | Maintenance backlog, parts shortage | factoryUptime, partsBuffer, unitCost |
| Communication coordination | Admin/logistics need -> telegraph/radio -> coordination -> lower waste/delay -> wider markets -> more need | Information raises effective logistics capacity | Network outage, power loss | coverage, latency, coordinationEfficiency |
| Electricity distribution | Generators -> grid -> distributed motors/lights/comms -> higher productivity -> demand for more grid | Controllable power separates production from fuel site | Brownout, instability | powerCapacity, reserveMargin, gridStability |
| Computer control | Precision industry -> computers -> scheduling/control -> factory/logistics efficiency -> better precision industry | Calculation converts complexity into efficiency | Power instability, chip shortage | compute, controlCoverage, schedulingGain |
| Semiconductor scaling | Clean rooms -> chips -> better instruments/control -> higher fab yield -> better chips | Miniaturization improves its own tooling | Defects, ultrapure supply, rare materials | fabYield, defectRate, waferPurity |
| AI chip optimization | AI chips -> ML models -> production/fab optimization -> better chip designs/yields -> stronger AI chips | AI improves its own substrate indirectly | Data/compute shortage, alignment limits | aiChipOutput, optimizationGain, modelQuality |
| Server compute | Stable grid+cooling -> data centers -> compute -> AI/logistics/research optimization -> better grid/cooling | Compute becomes industrial infrastructure | Cooling failure, power cost | uptime, coolingHeadroom, computeUtil |
| Data network | Sensors/users -> data -> model training/forecasting -> better operations -> more sensors/services -> more data | Data improves prediction and automation | Bad data, privacy/trust failure | dataQuality, bandwidth, forecastGain |
| Research infrastructure | Education+instruments -> experiments -> theory -> better tools/processes -> more research capacity | Research capacity compounds through instruments | Material/sample shortage, instability | researchRate, experimentSuccess, instruments |
| Space industry | Rockets -> satellites/orbital mining -> comms/resources/power -> stronger Earth industry -> more launches | Space relieves observation/resource/power limits | Launch failure, overinvestment | launchCadence, payload, orbitalImport |
| Quantum computation | Cryo+QPU -> Q-compute -> materials/AI simulations -> better QPUs/materials -> more Q-compute | Specialized compute accelerates science | Decoherence, cryo/power failure | qCompute, errorCorrection, cryoUptime |
| RSI governance | Advanced AI+compute -> AI-assisted AI design -> stronger AI -> better chips/servers/power -> more AI design speed | The improvement process improves itself | Misalignment, control compute shortage | selfImprovementRate, controlMargin, risk |

## 9. Cross-Era Dependencies

Old systems remain relevant because their metrics are direct constraint terms
for later processes.

Examples:

- Agriculture failure -> food deficit -> population decline -> labor shortage
  -> maintenance failure -> fab/server/RSI slowdown.
- Storage failure -> spoilage -> famine risk -> inability to move labor into
  education or mining.
- Mining failure -> tool/steel/chip/rocket/quantum material shortage.
- Logistics failure -> all input ratios drop even when stocks exist somewhere.
- Power instability -> factory yield loss -> chip defects -> compute shortage.
- Cooling failure -> server throttling -> AI research collapse.
- Communication failure -> coordination multiplier drops -> logistics delay
  rises -> factories starve.
- Space failure -> rare-material pressure returns to terrestrial mines.
- Quantum failure -> late-game research/AI acceleration stalls.
- Alignment/control failure -> AI automation cannot safely deploy, snapping
  labor demand back to older systems.

## 10. Breakthrough System

Each breakthrough uses readiness plus pressure:

```ts
function evaluateBreakthrough(id: string, state: SimState, content: ContentDB) {
  const b = content.breakthroughs[id];
  const prereqReady = b.prerequisites.every(c => compare(metricValue(state, c.metric), c.op, c.value));
  const pressure = average(b.pressureMetrics.map(m => normalizedPressure(state, m)));
  const observations = b.experiments.every(exp => state.knowledge.observations[exp.id] > 0);

  return {
    ready: prereqReady && observations && pressure >= 1,
    pressure,
    missing: explainMissingBreakthroughInputs(b, state),
  };
}
```

Pressure examples:

| Breakthrough | Pressure source | Readiness source |
|---|---|---|
| Pottery/storage | Spoilage and famine risk | Clay, fire, surplus labor |
| Irrigation | Harvest volatility and drought | River/water source, organized labor |
| Writing/accounting | Trade/tax/labor tracking complexity | Settlement, surplus, administrators |
| Metallurgy | Tool breakage and construction limits | Ore access, fuel, furnaces |
| Steam | Mine flooding, labor bottleneck, energy demand | Coal, metalworking, pumps |
| Railways | Coal/ore/food transport congestion | Steel, steam engines, capital |
| Electricity | Need for controllable distributed power | Copper, generators, institutions |
| Computers | Calculation/control/logistics complexity | Precision industry, stable power, electronics |
| Semiconductors | Reliability/miniaturization pressure | Clean rooms, silicon, chemistry |
| AI | Optimization pressure, data scale, automation limits | Compute, data, chips, researchers |
| Space | Communication/resource/observation pressure | Rockets, chips, fuels, advanced industry |
| Quantum | Classical simulation limits | Cryogenics, precision fab, stable power |
| RSI | Human research speed limit | Advanced AI, compute, simulation, safety |

## 11. Productivity Improvement System

Every new era must improve at least one older system. Implement this as
measurable `ImprovementDef` output, not lore text.

Examples:

| New system | Older system improved | Metric change |
|---|---|---|
| Pottery | Food | Lower spoilage, larger buffer |
| Irrigation | Farming | Lower harvest volatility, higher water reliability |
| Metal tools | Farming/mining/building | Higher output per labor, lower breakage |
| Roads/ports | Food/mining/trade | Lower logistics delay, larger market radius |
| Steam pumps | Mining | Greater mine depth, lower flooding loss |
| Rail | Agriculture/mining/factories | Higher bulk logistics capacity |
| Electricity | Factories/comms | Higher uptime and distributed power |
| Communication | Logistics/research | Lower coordination delay |
| Computers | Factories/logistics/research | Higher scheduling efficiency |
| AI chips | Chip fabs/factories/research | Optimization gain, yield gain |
| Data centers | AI/logistics/grid | More compute and control coverage |
| Space | Comms/resources/power | Satellite data, rare material imports, orbital solar |
| Quantum | Materials/AI/science | Higher simulation breakthrough rate |
| RSI | Improvement process itself | Self-improvement rate, automated design throughput |

The gate must prove this improvement over a rolling baseline:

```ts
function computeOlderSystemImprovement(loop: LoopDef, state: SimState): number {
  let passed = 0;
  for (const req of loop.improvesOlderSystems) {
    const current = rollingMean(state, req.metric, 120);
    const baseline = historicalBaseline(state, req.metric, req.olderSystem);
    if (baseline > 0 && current / baseline >= req.minImprovementRatio) passed += 1;
  }
  return passed / loop.improvesOlderSystems.length;
}
```

## 12. Stability Metrics

The exact threshold values are balance data. These are the metrics the engine
must expose.

| Domain | Metrics |
|---|---|
| Food | surplus ratio, buffer days, spoilage rate, nutrition, fertility trend |
| Population | growth slope, death rate, health, morale, housing headroom |
| Labor | utilization, idle labor, shortage by skill, specialization mismatch |
| Storage | capacity ratio, protected fraction, spoilage volatility |
| Tools | coverage, wear rate, replacement rate, output per labor |
| Mining | ore output, grade trend, depletion horizon, mine depth, transport demand |
| Industry | uptime, parts buffer, maintenance backlog, throughput, pollution |
| Logistics | capacity/demand, delay, congestion, lost shipments |
| Power | reserve margin, grid stability, blackout risk, frequency variance |
| Communication | coverage, latency, coordination efficiency |
| Compute | utilization, uptime, cooling headroom, power per compute |
| Chips | fab yield, defect rate, rare-material pressure, clean-room uptime |
| AI | model capability, optimization gain, automation coverage, alignment pressure |
| Space | launch cadence, failure rate, payload mass, orbital import/export |
| Quantum | qubit yield, error correction stability, cryo uptime, Q-compute |
| RSI | self-improvement rate, control margin, simulation coverage, risk budget |

## 13. Failure and Regression

Failures should cause stagnation first, then regression if ignored.

```ts
interface FailureRule {
  id: string;
  trigger: GateCondition[];
  warningTicks: number;
  crisisTicks: number;
  effects: ExternalityDef[];
  recoveryActions: string[];
  regressionTargetEra?: EraId;
}
```

Examples:

- Food loop failure: population growth stops, health falls, labor shrinks.
- Tool loop failure: farm/mine output drops, causing food and industry stalls.
- Coal loop failure: steam factories underutilize, rail slows, mines starve.
- Power loop failure: fabs, servers, comms, and cooling all throttle.
- Cooling failure: compute drops, AI optimization disappears, research slows.
- Space overinvestment: Earth-side fuel/steel/chips shortage causes older loops
  to suffer.
- Quantum instability: Q-compute unavailable, RSI gate cannot pass.
- RSI risk failure: autonomy must be rolled back, reducing optimization gains.

Recovery must be explicit and diagnosable: reduce load, rebuild buffer, repair
maintenance, add storage, retrain labor, increase reserve, lower autonomy, or
rollback experiments.

## 14. MVP Implementation Scope

Do not implement all eras first. The MVP should prove that loop-based
progression is fun.

MVP eras:

1. Gathering
2. Agriculture
3. Storage and early settlement
4. Craft/tools
5. Mining unlock

MVP resources:

- wild_food
- food
- seeds
- grain
- preserved_food
- wood
- fiber
- clay
- stone
- ore
- tools
- housing
- knowledge

MVP population:

- unskilled
- skilled
- health
- morale
- housingCapacity

MVP processes:

- forager_camp
- field
- compost_yard
- drying_rack
- granary
- potter
- toolmaker
- housing
- school
- quarry
- mine
- bloomery

MVP loops to prove:

1. Food survival loop.
2. Farming birth/labor loop.
3. Storage anti-spoilage loop.
4. Tool productivity loop.
5. Education/specialization loop.
6. Mining/tool loop.

MVP tests:

- Determinism: two same-seed runs hash-identical.
- No spike unlock: a gate cannot pass from one tick of surplus.
- Food shock: drought resets agriculture stability counter.
- Storage value: adding granaries increases survival horizon.
- Tools value: tool coverage raises food/ore output per labor.
- Mining unlock: mining gate requires food surplus while extraction labor is
  active.
- Cascade traceability: famine lowers population, then mining, then tools.

## 15. Debug and UI Contracts

The UI must expose why an era is not unlocking.

Required readouts:

- Era gate checklist with each condition and rolling window progress.
- Loop diagram with inactive nodes highlighted.
- Bottleneck analyzer listing top binding `min()` terms.
- Trend sparklines for each gate metric.
- Shock/resilience panel showing which test fails.
- Breakthrough readiness panel: pressure, missing prerequisites, experiments.
- Cross-era dependency graph from a failing metric to upstream causes.

Programmer contract:

```ts
interface GateDebugView {
  era: EraId;
  nextEra?: EraId;
  canUnlock: boolean;
  sustainTicks: number;
  requiredSustainTicks: number;
  failedReasons: string[];
  loops: Array<{
    id: LoopId;
    closed: boolean;
    failedReason?: string;
    surplusRatio: number;
    bottleneck: string;
    resilienceScore: number;
  }>;
  breakthrough: {
    ready: boolean;
    pressure: number;
    missing: string[];
  };
}
```

If a player asks "why am I stuck?", this structure should answer it without a
developer reading logs.

## 16. Save Data

Save simulation state, not rendered entities.

```ts
interface SaveGame {
  schemaVersion: 1;
  contentVersion: string;
  seed: number;
  tick: number;
  currentEra: EraId;
  unlockedEras: EraId[];
  stocks: Record<ResourceId, StockState>;
  population: PopulationState;
  infrastructure: InfrastructureState;
  environment: EnvironmentState;
  knowledge: KnowledgeState;
  processCounts: Record<ProcessId, number>;
  loopRuntime: Record<LoopId, Pick<LoopRuntime, 'stabilityTicks'>>;
  gateRuntime: Record<EraId, EraGateRuntime>;
  queuedCommands: PlayerCommand[];
}
```

Version saves. Content migrations must map renamed resources/processes or mark a
save incompatible with a clear UI message.

## 17. Implementation Order

1. Extract a headless `loop-sim` module from the prototype pattern.
2. Move resources, processes, loops, breakthroughs, and gates into JSON.
3. Implement rolling telemetry and gate debug output.
4. Implement MVP A-E content only.
5. Add deterministic tests for MVP loops and shock/reset behavior.
6. Build the UI around `GateDebugView`, not around hidden rules.
7. Add later eras only after the MVP loop progression is fun and readable.

## 18. Non-Negotiable Invariants

- Era unlocks require sustained loop stability, not accumulated currency.
- Every era depends on at least one previous era metric.
- Every era improves at least one previous era metric.
- Every process reports utilization and binding bottleneck.
- Every gate failure is explainable from sim telemetry.
- All loop/gate logic runs headlessly and deterministically.
- Late-game systems can fail if food, labor, power, maintenance, or logistics
  fail.
- RSI is a phase change in governance and risk, not just another research item.

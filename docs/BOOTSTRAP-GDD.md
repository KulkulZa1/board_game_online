# BOOTSTRAP — *From Soil to Singularity*
### Civilization-Scale Automation & Interdependency Simulation — Game Design Document v1.0

> A working, validated MVP of this design's simulation core lives in
> [`prototypes/bootstrap-sim/`](../prototypes/bootstrap-sim/) (`node prototypes/bootstrap-sim/test.js`).
>
> Programmer-facing data structures, simulation variables, update rules, and
> era stability pseudocode are specified in
> [`docs/loop-progression-technical-spec.md`](loop-progression-technical-spec.md).

**The spine.** Every producer runs each tick at an **effective utilization** equal to the *minimum* of all satisfied constraints:

```
utilization = min(input_materials, labor, power, maintenance, logistics, environment)
output      = nominal_output × utilization
```

This single rule is why old systems never become irrelevant: a 2050s AI fab drops to 40% if a wheat harvest fails three regions away (famine → population → labor → maintenance crews → the fab's maintenance term). The game is a stock-and-flow simulation where bottlenecks propagate through this `min()`.

---

## 1. Game Concept
- **Pitch.** A civilization automation sim from foraging berries to a recursively self-improving intelligence redesigning your supply chains. You never graduate *out* of farming — you *stack* farming under industry under computing under AI; every layer keeps feeding the ones above.
- **Core fantasy.** Steward of a civilization across 10,000 years; you watch grain stocks, literacy, grid frequency, and model-alignment dashboards and pull levers that ripple for decades.
- **Motivation.** Mastery of an interdependent system. The reward is *earned* stable expansion (e.g., a food surplus that lets you pull 8% of farmers into a new steel works without famine).
- **Differences from ordinary factory games.** Throughput resource is **people**, not items on belts; progress is gated by **sustained stability**, not science packs; automation **frees labor** that migrates up the pyramid; the antagonist is **entropy** (famine, blackout, overheating, misalignment); the map **stratifies** instead of resetting.
- **Why agriculture first.** It teaches the root identity — *a calorie is the root resource, a person is the root machine* — so the late-game famine→labor→fab cascade is intuitive, not arbitrary.

## 2. Core Gameplay Loop
- **Universal loop:** read dashboards → find the binding constraint (the term setting `min()`) → widen it → absorb the surplus into the next bottleneck → stabilize → push a gate.
- **Early (Gathering→Settlement):** hand-place workers/farms; balance production vs spoilage; build storage/housing; watch morale/health.
- **Mid (Mining→Mass Production→Computers):** manage **districts** and **logistics corridors**, the first power grid, and pollution.
- **Late (AI Chips→Space→Quantum):** manage **stability margins and supply-chain depth** (8–12-step chains), grid frequency, datacenter cooling, rare-material imports.
- **Post-RSI endless:** the AI auto-builds; you become **governor** — set objectives/constraints, manage Misalignment Pressure, handle crises.
- **Success measure:** the **Civilization Index** (well-being × productivity-per-capita × resilience), plus per-era stability gates and (endless) megastructures/elegance metrics.

## 3. Era-by-Era Progression
*(Theme · Goals · New resources · Buildings · Mechanics · Sustained unlock gate · Failure · Why it stays relevant)*

- **A. Gathering** — survive on the wild. Wild Food/Wood/Fiber/Stone, Population, Labor. Forager Camp, Drying Rack. Tiles deplete; spoilage clock. **Gate→Farming:** food surplus 4 seasons, pop ≥12, Cultivation experiment, fertile tile scouted. *Fail:* over-forage to barren. *Later:* wild zones = fallback food + pollution sink.
- **B. Farming** — the first surplus. Seeds/Grain/Water, **Soil Fertility (per-tile)**. Field, Granary, Irrigation, Compost. Fertility depletes with monocropping, recovers via fallow/rotation/compost; first free labor. **Gate→Food Service:** surplus +20% (6s), fertility ≥60%, pop ≥40, granary buffer. *Fail:* soil exhaustion, drought, pests. *Later:* grain feeds every food product; fertility/water never stop mattering.
- **C. Food Service** — calories→nutrition+services. Meals, Nutrition, Salt/Spice. Kitchen, Restaurant, Market, Cold Cellar. Cooked meals raise food→pop efficiency + morale; first service labor. **Gate→Settlement:** morale, nutrition, service labor ≥10% (6s). *Later:* scales into the service/logistics economy.
- **D. Settlement** — social organization as infrastructure. Housing, **Health**, Social Complexity, Knowledge. Housing Block, Clinic, Sanitation, Town Hall (institution, unlocks Dependency Graph). Density ↑productivity & ↑disease; migration begins. **Gate→Mining:** housing ≥ pop, health, complexity tier 2, institution, food buffer ≥ N seasons. *Later:* housing/health/morale are permanent labor multipliers.
- **E. Mining** — finite depletion enters. Copper/Tin/Iron/Coal/Clay, **graded deposits**. Quarry, Mine, Bloomery. Deposits deplete & drop grade; first real logistics demand. **Gate→Early Factory:** metal stock, transport ≥ demand, food surplus held while 20% labor in extraction. *Later:* every chip/rocket/qubit traces to ore → drives exploration & space mining.
- **F. Early Factory** — deliberate chains. Coke, Pig Iron, Steel, Tools, Parts, Bricks. Workshop, Foundry, Sawmill, Toolsmith. Multi-step chains; **tools as capital** (more yield per laborer); **maintenance** introduced. **Gate→Mass Production:** tool coverage, steel throughput, maintenance backlog ≈0. *Fail:* charcoal deforestation; parts shortage → maintenance backlog cascade. *Later:* steel/parts universal; maintenance is the silent late tax.
- **G. Mass Production** — mechanization; pollution. Coal, Steam, Cement, Glass. Assembly Line, Steam Plant, Rail Depot. **Power as shared budget**; **rail logistics**; **pollution → ↓fertility/health** (first loop back to agriculture). **Gate→Communication:** power reserve ≥15%, logistics ≥ demand, pollution below damage threshold. *Fail:* brownout, pollution famine, rail congestion.
- **H. Communication** — coordination multiplier. Wire, Signal Coverage, Coordination Efficiency. Telegraph, Relay Tower, Logistics HQ. Coordination = global logistics/research multiplier needing coverage+power+maintenance. **Gate→Computer:** coverage ≥ X%, coordination ≥ T, Electronics theory. *Fail:* network outage crashes logistics civilization-wide.
- **I. Computer** — precision + compute. Silicon, Circuit Boards, **Data**, **Compute**. Electronics Plant, Clean Room, Data Office. Precision needs Clean Room + **stable** power (brownouts ruin yield). **Gate→AI Chip:** compute ≥ N, clean-room yield, power frequency variance ≤ ε, engineer share.
- **J. AI Chip** — fragile deep supply chain. Ultra-pure Wafers, Rare Materials, Ultrapure Water, Photoresist, **AI Chips**. Wafer Fab, Lithography, Chemical Plant, Packaging. Multiplicative yield across 8+ steps; cooling appears. **Gate→Adv. Power:** chip output, fab yield, rare-material supply; **power demand now exceeds legacy grid** (forces next era). *Fail:* one mid-chain shortage collapses final output.
- **K. Advanced Power Grid** — energy as a managed system. Uranium, Renewables, Storage, **Grid Stability**. Nuclear, Solar/Wind, Grid Storage, Smart Grid Controller (needs compute). Splits **capacity vs stability**; renewables hurt stability without storage. **Gate→Server:** stability ≥95% at peak, reserve margin, storage. *Fail:* cascading blackout — every powered system drops at once.
- **L. Server & Data Center** — industrial compute; heat is the enemy. Server Racks, Cooling, Bandwidth, **Compute (scaled)**. Server Hall, Cooling Plant, Network Backbone. Cooling (needs power+water) throttles compute; AI training viable. **Gate→Space:** compute, cooling headroom, uptime ≥99%, AI capability tier. *Fail:* thermal runaway → compute collapse → research/automation collapse.
- **M. Space** — expand the frontier, stress the home economy. Rocket Fuel, Launch Capacity, Satellites, Space Minerals, Orbital Solar. Launch Complex, Satellite Factory, Orbital Mining, Space-Solar Receiver. Second map layer; **space expands, never replaces** — orbital solar feeds the grid, asteroid mining relieves fab-bottlenecking rare-material depletion, but launches drain fuel/steel/chips/engineers. **Gate→Quantum:** launch cadence, off-world rare-material import, orbital power online, compute. *Fail:* launch failure wastes a huge batch; over-investment starves Earth.
- **N. Advanced AI** — AI from tool to co-manager. AI Models (tiers), Automation Coverage, **Alignment/Trust**. Training Cluster, AI Ops, Data Farms. Training = Compute×Data×Power×time; deployment cuts labor demand + raises efficiency (**frees population upward**). Autonomy ↑productivity but ↑Misalignment Pressure. **Gate→Quantum:** AI capability tier, automation coverage, alignment safe band, cryo/exotic infra.
- **O. Quantum** — extreme precision. Cryogen, Exotic Isotopes, Qubits, **Q-Compute**, Error-Correction. Cryo-Plant, Quantum Foundry, Error-Correction Array. Needs near-perfect power stability + deep cooling + exotic materials + classical compute for EC; Q-Compute super-charges *research/AI*. **Gate→RSI:** EC stability sustained, Q-Compute ≥ N, AI tier, safety+simulation infra, cross-layer surplus. *Fail:* decoherence storms, cryo failure.
- **P. RSI (Recursive Self-Improvement)** — a **phase change**. Self-Improvement Rate, **Misalignment Pressure**, Control Compute, Simulation Capacity. RSI Core, Simulation Foundry, Alignment/Control Center, Self-Designing Fab. AI auto-proposes/auto-builds; research becomes recursive; autonomy×speed raises misalignment, bled off by Control Compute + simulation testing + player constraints. **You shift from builder to governor.** *Fail:* runaway (crisis events, control loss) or stall (throttled to inertness); recovery = costly rollback. 
- **Q. Endless Post-RSI** — stewardship under escalating challenge. AI designs most factories; player sets objectives/ethics/risk budgets; crisis events (solar flare, pandemic, misalignment, resource crash) test **resilience**. A Dyson swarm still bottoms out on food→labor→maintenance if you neglect the base.

## 4. Resource System
Layered; each layer = lower layers + labor + energy.

| Layer | Examples |
|---|---|
| Natural | Wild Food, Wood, Fiber, Stone, Water, Coal, Ore, Silica, Rare Materials |
| Agricultural | Seeds, Grain, Vegetables, Livestock, Soil Fertility, Water |
| Food | Meals, Preserved Food, Nutrition Quality |
| Human | Population (by tier), Health, Morale |
| Labor | Labor-hours (Unskilled/Skilled/Engineer/Researcher) |
| Knowledge | Insights, Tech, Literacy |
| Minerals | Copper, Iron, Coal, Uranium, Silicon, Rare Materials |
| Industrial | Steel, Cement, Glass, Parts, Tools, Wire |
| Energy | Biomass, Steam, Electricity (capacity+stability), Nuclear, Renewable, Fusion |
| Data/Compute | Raw/Curated Data, Compute, Q-Compute |
| AI | AI Chips, AI Models, Automation Coverage, Alignment |
| Space | Rocket Fuel, Launch Capacity, Satellites, Space Minerals, Orbital Power |
| Quantum | Cryogen, Exotic Isotopes, Qubits, Q-Compute, Error-Correction |

**Signature chains:** Food: `Seeds+Water+Labor+Soil→Grain→(+Heat)→Meals→Population`. Steel: `Ore+Coke+Heat→Pig Iron→Steel`. Chip: `Silica→Wafer→(+Photoresist+RareMat+CleanRoom)→Die→AI Chip`. Compute: `Chips+Steel+Power+Cooling+Network→Server→Compute`. AI: `Compute×Data×Power→Model→Automation Coverage (↓labor, ↑util)`. Quantum: `Isotopes+Cryogen+StablePower+Compute→QPU→Q-Compute→Research/AI`. RSI: `AI+Compute+Q-Compute+Sim+Safety→Self-Improvement Rate→Research`. **No resource is terminal** — AI's output loops back down to reduce farm labor (the central virtuous loop).

## 5. Population & Society
Central resource **and** vulnerability. Structured stock: **skill tiers** (Unskilled→Skilled→Engineer→Researcher) promoted via education+time+food surplus; **food demand** (per-capita, grows with density); **housing** (overflow→morale/health penalty→emigration); **health** (sanitation/clinics/nutrition/pollution/density → gates births & labor); **education** (literacy = research multiplier); **morale** (nutrition variety, services, housing, jobs); **labor specialization** (mismatch matters — idle farmers can't staff a fab); **social complexity** (unlocks institutions); **urban density** (productivity ↑, risk ↑); **migration**; **maintenance workforce** (advanced buildings need continuous skilled labor or they decay). *Vulnerability:* famine → lost engineers → fab maintenance crews vanish → yields decay *weeks later*, hence the diagnostic UI (§16).

## 6. Agriculture & Food (deep,始まりであり終わらない)
Wild gathering → primitive farming (`yield = base×fertility×water×labor×tools×climate`) → irrigation (buffers drought) → rotation/fallow (restore fertility; monocropping is a greed-trap) → soil fertility (damaged by over-farming **and pollution**) → livestock (meat+animal labor+fertilizer, competes for grain) → storage/spoilage (buffers survive bad seasons; gates require *buffers*) → cooking/restaurants (more people per grain + morale) → nutrition (modifies growth/health/research aptitude) → industrialized (tractors/fertilizer: huge yield/laborer but needs industry+energy, worsens pollution) → automated (robotic farms) → AI-optimized (yield + disease/drought prediction, but depends on compute/power/data). **Stays critical:** per-capita demand grows with population/lifestyle; a 50M-person AI civilization needs vastly more food, still rooted in fertility/water/pollution.

## 7. Factory & Automation
Manual → Workshop (tools amplify labor) → Conveyor (intra-district movement) → Assembly Line (multi-step, fragile) → Robotic (replaces labor slots, frees Unskilled→retrain) → Smart (compute-driven) → AI-managed (dynamic rebalancing raises effective `min()`) → Self-expanding (RSI auto-builds). **Cross-cutting:** bottleneck = binding `min()` term (Analyzer names it); **throughput ≠ production**; efficiency rises with tools/tech/AI, falls with low util & decay; **maintenance** = continuous Parts+skilled-labor draw (unmet → efficiency decay → failure → keeps old factories relevant); scaling stresses upstream (doubling a fab doubles power/cooling/labor/rare-material draw).

## 8. Technology & Research (infrastructure-gated, not "spend points")
`research_rate = researchers × literacy × institution_quality × instruments × (data×compute) × material_samples × social_stability`, **plus hard gates** (prior techs **and** operating infrastructure, e.g., Photolithography needs a Clean Room running ≥90% + engineers + ultrapure-silicon sample). Education, institutions, tools/instruments, experiments (consume materials/compute, can fail), data/compute, industrial capability, and stability all required. Research is a **capacity you build**, not a currency you hoard — so tech-rushing is impossible.

## 9. Interdependency (the heart)
```
Agriculture→Food→Population→Labor(tiers)→{Mining, Manufacturing, Logistics, Research, Maintenance}
Energy(capacity+stability)→{Manufacturing, Computing, Cooling, Comms}
Communication→Coordination→Logistics→input delivery everywhere
Mining→Industrial materials→everything physical
Chips←Fabs←{Materials, Power-stability, Engineers}; Servers←{Chips,Power,Cooling,Network}→Compute
Compute→{Research, AI training, Smart/AI factories, Grid stability}
AI→Automation Coverage→↓Labor demand→frees Population→↑Research→↑AI   (virtuous loop)
Quantum←{Cryo,Exotic mat,Stable power,Compute}→accelerates Research/AI
RSI←{High AI, Massive compute, Q-Compute, Simulation, Safety, Abundance}
Pollution←Industry/Energy→↓Fertility & Health→↓Agriculture & Labor   (vicious loop to the start)
Maintenance(skilled labor+parts)→prevents decay of ALL advanced systems
```
**Chain-reactions:** *Crop disease → food shortage → population decline → factory labor shortage → mining slowdown → semiconductor bottleneck → AI-chip shortage → server expansion failure → RSI delay.* *Renewables w/o storage → stability↓ → fab yield caps 70% → chip output↓ → datacenter stall → AI training slows → automation stalls → labor trapped in farms → research plateaus.* *(All reproducible in the prototype's cascade test.)*

## 10. Energy (capacity vs stability tracked separately)
Human → Animal → Biomass → Coal/Steam → Oil → Electricity (capacity + **reserve margin**) → Grid management → Nuclear (stable baseload) → Renewables (capacity↑, stability↓) → Storage (stabilizes renewables) → Fusion → Space-based → AI-adaptive grid (compute↔power loop) → Quantum-era (near-perfect stability + cryo). **Advanced systems care about stability, not just watts** — a 110%-capacity/80%-stability grid silently throttles fabs/datacenters/QPUs; worst failure is a cascading blackout under thin margin.

## 11. Communication / Computing / AI
Messengers → records → telegraph → telephone → radio → digital networks → computers → data centers → ML → AI chips → AI-managed logistics → AI research assistants → autonomous AI → RSI. **Substrates interlock multiplicatively:** Chips (fab chain) → Compute (needs stable power + cooling) ; Cooling (needs power+water) ; Network/bandwidth (weak → coordination/logistics drop) ; Data (population+sensors). `AI capability = f(Compute, Data, time, prior models)`; deployed → Automation Coverage + research assistance; **Alignment/Trust** governs safe autonomy. A power/cooling failure *un-deploys* AI gains, snapping labor demand back up.

## 12. Space Age
Rocket production (Fuel+Steel+Chips+Engineers→Launch Capacity), Satellites (comms/data/prediction), Orbital infra, Space mining (rare materials = relief valve for terrestrial depletion), Off-world factories (no Earth pollution, extreme logistics cost), Space-based solar (stable capacity), Planetary logistics (second layer; cadence/transfer windows), AI-managed exploration. **Expands and stresses** the planet economy — every launch is a violent draw on fuel/steel/chips/engineers; mismanaged, the program *causes* an Earth-side famine/blackout.

## 13. Quantum & RSI
**Quantum prereqs (all):** cryogenics, exotic materials, QPU fab (stricter than logic), classical compute for error correction, near-perfect power stability. Q-Compute is **hybrid** (useless without classical scheduling/EC) and multiplies the *knowledge economy*. **RSI is a phase change** atop a mature, abundant, stable civilization: research becomes recursive; AI auto-designs/builds; **Misalignment Pressure** rises with autonomy×speed, bled off by Control Compute + simulation testing + constraints. Crossing the red line → crisis events (resource hijacking, opaque decisions, control loss), recoverable via costly rollback or pre-built safety infra. Stable RSI sustained → Endless.

## 14. Era Unlock Conditions (multi-condition, **sustained** for a window)
| To unlock | Conditions (ALL, sustained) |
|---|---|
| Farming | surplus +0% (4s); pop ≥12; Cultivation; fertile tile |
| Food Service | surplus +20% (6s); fertility ≥60%; pop ≥40; granary buffer |
| Settlement | morale; nutrition; service labor ≥10% (6s) |
| Mining | housing ≥ pop; health; complexity tier 2; institution; food buffer ≥N seasons |
| Early Factory | tool coverage; steel throughput; maintenance backlog≈0 |
| Mass Production | power reserve ≥15%; logistics ≥ demand; pollution < threshold |
| Communication | coverage ≥X%; coordination ≥T; Electronics theory |
| Computer | compute ≥N; clean-room yield; freq variance ≤ε; engineer share |
| AI Chip | chip output; fab yield; rare-material supply |
| Adv. Power | grid stability ≥95% peak; reserve; storage |
| Server/DC | compute; cooling headroom; uptime ≥99%; AI tier |
| Space | launch cadence; off-world import; orbital power; compute |
| Quantum | EC stability (sustained); Q-Compute ≥N; AI tier; safety+sim infra; surplus |
| RSI | stable RSI loop (positive self-improvement, contained misalignment, healthy base) sustained |

"Sustained" is the anti-rush mechanism and the source of the fantasy: prove stability, don't snapshot it.

## 15. Failure & Recovery (cascading but recoverable, with a visible cause)
Famine, disease, labor collapse, resource depletion, pollution, grid blackout, logistics congestion, maintenance failure, datacenter overheating, AI misalignment, launch failure, quantum instability. Each is a **spiral with a traceable cause and a costly-but-real exit** (e.g., blackout → shed load/add reserve/restart; misalignment → control compute/sim testing/rollback). The drama is catching the cascade early; cascades have a *delay* (drama) but a *trail* (fairness).

## 16. Interface & Readability (the #1 UX risk)
Era Dashboard (next gate checklist + which condition fails) · **Dependency Graph** (click a struggling node → highlights upstream causes) · **Bottleneck Analyzer** (names the binding `min()` term + top-5 global bottlenecks) · Civilization Health (food balance, population pyramid, health/morale/pollution, Index) · Production Chain Viewer (Sankey of an output back to raw inputs) · Population/Welfare (labor sliders by sector+tier) · Power Grid (capacity vs load vs **stability**) · AI Compute (compute/data/cooling, capability, **Misalignment gauge**, proposals) · Research Readiness (green/red prerequisite checklist). **Principle:** every number is clickable into its cause; the fun is diagnosis.

## 17. Map & World
Hex/region map; biomes (plains/forest/river/mountain/desert/coast); soil fertility by biome (degrades with use+pollution); rivers (water/cooling/transport/hydro); forests (wood + pollution sink); finite graded mineral deposits; climate (yield variance + disasters); transport corridors with throughput (roads→rail→maglev→drones; congestion is first-class); **spatial pollution** (spreads to adjacent farmland → zoning decisions); launch sites; late-game **orbital + interplanetary layers** stacking atop the still-working Earth map.

## 18. Endgame & Endless
Self-expanding civilization (AI auto-builds to your objectives), planetary optimization (max Index, min pollution/output), space colonization (each colony re-bootstraps agriculture→industry — reinforcing the thesis), AI-designed factories, infinite research, megastructures (Dyson swarm), resilience challenges & crisis events, ethical/control constraints (productivity vs risk vs welfare sliders). Endless preserves base-layer importance.

## 19. Balancing Philosophy
Complexity only if **traceable** in UI; automation **changes** the decision, not removes it; history is intuition-scaffolding bent for pacing; simulate **causality** faithfully, abstract **magnitudes**; bottlenecks must be diagnosable in ~30s and fixable with a clear costly action; dependencies constrain **order** but leave wide freedom in **how** to satisfy a gate (gates check outcomes, not builds).

## 20. Prototype Scope (MVP) — **implemented & validated** in `prototypes/bootstrap-sim/`
**Includes:** gathering, farming, food storage & spoilage, soil fertility (drain/restore + blight), two-tier population (food-driven growth/starvation), education (unskilled→skilled), housing-capped growth, finite/depleting ore, the Ore→Steel→Tools chain, tools-as-capital with wear, the `min()` engine, labor allocation, Bottleneck Analyzer, sustained multi-condition gates, and one fully-wired cascade (crop blight → food → population → labor → mining/steel). **Excludes (later):** power grid & stability, pollution loop, logistics congestion, multi-region map, comms/computers/AI/quantum/RSI, space — all addable as new data-driven resources/buildings without engine rewrites.

---

# Implementation Roadmap (indie team, ~3–6 people)

**Cross-phase non-negotiables:** (1) sim core stays **headless-testable & deterministic** (automatable balance); (2) every new system ships **with its diagnostic UI** in the same milestone; (3) a **continuous automated balance harness** runs N headless games per build to catch dominant strategies & dead-end gates.

### Phase 0 — Pre-production (2–4 wks)
Data schema (buildings/resources/recipes JSON), tick simulation architecture (fixed-step, deterministic, headless), formal `min()` + stock-flow model. **Success:** headless sim loads recipe files, runs 1,000 deterministic ticks with logged stocks. *(Done in the prototype.)*

### Phase 1 — Prototype (8–10 wks)
**Systems:** `min()` engine; food/population/labor loop (2 tiers); gathering+farming+storage+spoilage+fertility; mining + Ore→Steel→Tools; tools-as-capital; 2 sustained gates; single region; Bottleneck Analyzer + labor UI. **Risks:** fiddly-not-fun loop; unreadable cascades; gate windows feel like waiting. **Tests:** induced famine reaches steel in N ticks & is traceable; gate can't pass on a 1-tick spike; removing tools deterministically drops farm output. **Success:** testers replay voluntarily and can *verbally explain* a stall from the UI alone. *(Sim core + tests complete; renderer pending.)*

### Phase 2 — Vertical Slice (10–14 wks)
**Scope:** Eras A–I in one polished region with power grid (capacity+stability), pollution→fertility loop, logistics congestion, maintenance decay, research-as-infrastructure, and Dependency Graph + Era Dashboard + Chain Viewer. **Risks:** UI legibility at this complexity (make-or-break); power *stability* opacity; sim performance at city scale. **Tests:** blackout cascade recoverable via load-shed; pollution-famine reproducible & diagnosable; research gate blocked until clean-room ≥90%; ≥10 districts at target FPS. **Success:** a tutorialized new player reaches Computer Age & diagnoses ≥80% of induced failures unaided; demoable for wishlists.

### Phase 3 — Alpha (4–6 mo)
**Scope:** content-complete A–O; multi-region map + corridors + biomes + climate; migration + full education tiers; comms/computing/AI-chip/server chains; AI models→automation loop; first space pass; all major UIs. **Risks:** combinatorial balance; AI trivializing mid-game; deep fab/quantum chains as unfun grinds; saving huge sim state. **Tests:** full *crop disease→…→RSI delay* end-to-end; AI deployment frees labor that measurably accelerates research; save/load round-trips a 50-region civ deterministically; every gate requires all conditions sustained. **Success:** zero→Quantum campaign without hard blocks; balance harness flags no dominant strategy across 100 runs; crash-free 4-hour sessions.

### Phase 4 — Beta (3–5 mo)
**Scope:** RSI + Endless; misalignment/governance; megastructures; crisis events; full tutorialization; accessibility/localization; audio; performance hardening; difficulty/scenarios. **Risks:** RSI feeling like "just a tech"; idle endless; punitive/ignorable misalignment; late-game perf. **Tests:** RSI crossing visibly changes tempo/role & is recoverable from a misalignment crisis; neglected-food endless run still collapses; onboarding reaches Settlement unaided; localized builds render all panels. **Success:** the "guiding a civilization" fantasy lands; median session ≥45 min; tutorial completion ≥70%; stable 60 FPS at max scale on mid-spec.

### Phase 5 — Full Release (2–3 mo + ongoing)
**Scope:** telemetry-driven final balance; scenario/challenge maps; resilience-themed achievements; modding hooks on the data-driven sim layer; day-one patch pipeline. **Risks:** post-launch balance volatility; mod-induced desync; long-tail perf. **Tests:** telemetry shows all eras *reached* by a healthy % (no silent wall); modded recipe files can't desync the deterministic sim; achievement/edge-case regression suite green. **Success:** stable launch, positive reception on **systemic depth + legibility**, a moddable core, and a live-ops plan for crisis/scenario content.

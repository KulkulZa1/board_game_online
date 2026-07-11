(function (root) {
  'use strict';

  const BREAKTHROUGHS = [
    {
      id: 'standardization', era: 1, icon: '⚙', name: '표준화 부품',
      bottleneck: '수작업 규격이 달라 생산선을 빠르게 복제할 수 없다.',
      narrative: '반복 납품과 설비 개량 압력이 부품 규격을 통일했습니다.',
      effect: '컨베이어 운송 속도 +20%',
      conditions: [
        { metric: 'research', target: 20, label: '톱니바퀴 납품' },
        { metric: 'throughput', target: 3, label: '목표 처리량/분' },
        { metric: 'upgraded', target: 1, label: '개량 설비' },
      ],
    },
    {
      id: 'grid_coordination', era: 2, icon: '⚡', name: '계통 조정',
      bottleneck: '개별 발전기는 수요 변화를 따라가지 못해 전기 기계가 흔들린다.',
      narrative: '모터 산업의 불안정한 수요가 발전과 배전을 하나의 계통으로 묶었습니다.',
      effect: '발전기 출력 +25%',
      conditions: [
        { metric: 'research', target: 15, label: '모터 납품' },
        { metric: 'powerRatio', target: 0.9, label: '전력 충족률' },
        { metric: 'generatorCount', target: 1, label: '가동 발전기' },
      ],
    },
    {
      id: 'programmable_control', era: 3, icon: '▦', name: '프로그램 제어',
      bottleneck: '복잡한 회로와 로봇 공정은 사람의 타이밍만으로 동기화하기 어렵다.',
      narrative: '반복되는 공정 지연을 제어 프로그램이 읽고 조정하기 시작했습니다.',
      effect: '모든 가공 기계 속도 +15%',
      conditions: [
        { metric: 'research', target: 10, label: '로봇 납품' },
        { metric: 'powerRatio', target: 0.85, label: '전력 충족률' },
        { metric: 'upgraded', target: 2, label: '개량 설비' },
      ],
    },
    {
      id: 'autonomous_optimization', era: 4, icon: '◇', name: '자율 최적화',
      bottleneck: '사람이 모든 설비와 전력 흐름을 동시에 최적화할 수 없다.',
      narrative: 'AI 코어가 병목과 전력 수요를 예측해 공장을 스스로 조정합니다.',
      effect: '전기 기계 전력 수요 -15%',
      conditions: [
        { metric: 'research', target: 8, label: 'AI 코어 납품' },
        { metric: 'powerRatio', target: 0.8, label: '전력 충족률' },
        { metric: 'upgraded', target: 3, label: '개량 설비' },
      ],
    },
  ];

  const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

  function evaluate(definition, snapshot) {
    const conditions = definition.conditions.map((condition) => {
      const current = Number(snapshot[condition.metric]) || 0;
      const ratio = clamp01(current / condition.target);
      return Object.assign({}, condition, { current, ratio, ok: ratio >= 1 });
    });
    return {
      definition,
      conditions,
      progress: conditions.length ? Math.min(...conditions.map((condition) => condition.ratio)) : 1,
      ready: conditions.every((condition) => condition.ok),
    };
  }

  function forEra(era) {
    return BREAKTHROUGHS.find((definition) => definition.era === era) || null;
  }

  function modifiers(unlockedIds) {
    const unlocked = new Set(unlockedIds || []);
    return {
      beltSpeed: unlocked.has('standardization') ? 1.2 : 1,
      generatorOutput: unlocked.has('grid_coordination') ? 1.25 : 1,
      machineSpeed: unlocked.has('programmable_control') ? 1.15 : 1,
      powerDemand: unlocked.has('autonomous_optimization') ? 0.85 : 1,
    };
  }

  const api = { BREAKTHROUGHS, evaluate, forEra, modifiers };
  if (root) root.FactoryEvolution = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

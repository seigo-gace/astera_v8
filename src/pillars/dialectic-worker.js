'use strict';

const { unique } = require('../canonical-v4-core');

async function run({ task = null, facts = {}, risks = {}, inquiry = {}, multi = {}, domain = {}, human = {} } = {}) {
  const t = task || { id: null, target: '対象', objective: '判断材料を構造化する', constraints: [], prohibitions: [], preserve: [] };
  const ja = /[ぁ-んァ-ヶ一-龠々]/.test(t.source_span?.text || '');
  const confirmed = facts.confirmed?.length || 0;
  const undetermined = facts.undetermined?.length || facts.unconfirmed?.length || 0;
  const riskObservations = risks.risks || [];
  const unresolved = inquiry.missing_fields || [];
  const constraintItems = unique([...(t.constraints || []), ...(t.prohibitions || []), ...(t.preserve || [])]);
  const domainViews = domain.primary?.multi_lens || [];
  const candidates = [
    {
      id: 'mainline', label: ja ? '主案視点' : 'Mainline view', angle: 'mainline',
      thesis: t.objective || t.target,
      observations: unique([`CONFIRMED=${confirmed}`, `UNDETERMINED=${undetermined}`, ...constraintItems]).slice(0, 12),
      source_lanes: ['fact', 'inquiry', 'multi']
    },
    {
      id: 'opposition', label: ja ? '反対視点' : 'Opposition view', angle: 'opposition',
      thesis: ja ? `${t.target || '対象'}について反証・未確定・制約側から見る。` : `View ${t.target || 'the target'} from counter-evidence, unresolved state, and constraints.`,
      observations: unique([...riskObservations.map((item) => item.observation || item.key), ...unresolved]).slice(0, 12),
      source_lanes: ['risk', 'inquiry']
    },
    {
      id: 'third_way', label: ja ? '第三視点' : 'Third view', angle: 'third_way',
      thesis: ja ? 'Scope・依存・Evidence境界ごとに材料を分離して見る。' : 'Separate the material by scope, dependency, and evidence boundary.',
      observations: unique([...(t.depends_on || []).map((id) => `dependency=${id}`), ...domainViews]).slice(0, 12),
      source_lanes: ['multi', 'compare']
    },
    {
      id: 'human_fit', label: ja ? '人読み表示視点' : 'Human-reading presentation view', angle: 'human_fit',
      thesis: ja ? '事実状態を変えず、Human Reader情報は表示順・説明量にだけ使う。' : 'Use Human Reader signals only for presentation without changing factual state.',
      observations: unique([human.mode ? `human_mode=${human.mode}` : '', human.urgency ? `urgency=${human.urgency}` : '']).filter(Boolean),
      source_lanes: ['inquiry']
    },
    {
      id: 'bad_hand', label: ja ? '失敗参照' : 'Failure reference', angle: 'bad_hand',
      thesis: ja ? 'UNDETERMINEDをCONFIRMEDとして扱う、または制約を無視する失敗Pattern。' : 'Failure pattern: promote UNDETERMINED to CONFIRMED or ignore explicit constraints.',
      observations: [ja ? '採否候補ではなく、失敗検出用の参照材料。' : 'Reference material for failure detection; not a selectable option.'],
      source_lanes: ['fact', 'risk', 'inquiry', 'compare']
    }
  ];
  return {
    pillar: 'dialectic', task_id: t.id || null,
    engine: 'Astera Deterministic Perspective Expansion', mode: 'post_lane_expansion',
    candidates,
    bad_hand_lessons: candidates.find((item) => item.id === 'bad_hand').observations,
    authority: { owns: ['perspective_expansion'], does_not_own: ['score', 'candidate_ranking', 'selected_candidate', 'decision', 'recommendation'] }
  };
}

module.exports = { run };

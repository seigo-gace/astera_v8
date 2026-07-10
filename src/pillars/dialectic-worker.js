'use strict';

function baseRisks(risks = {}) {
  return Array.isArray(risks.risks) ? risks.risks.map((r) => r.key) : [];
}

function countUnconfirmed(facts = {}) {
  return Array.isArray(facts.unconfirmed) ? facts.unconfirmed.length : 0;
}

function makeCandidate({ id, label, angle, thesis, strengths, failure_modes, required_checks, base = 80 }) {
  return { id, label, angle, thesis, strengths, failure_modes, required_checks, base };
}

function scoreCandidate(candidate, context) {
  const deductions = [];
  const riskKeys = baseRisks(context.risks);
  const unconfirmed = countUnconfirmed(context.facts);
  const unhealthy = context.inquiry?.problem_health && !context.inquiry.problem_health.healthy;
  const moodScore = Number(context.mood?.score || 0);

  if (candidate.angle === 'attack' && riskKeys.includes('security')) {
    deductions.push({ key: 'attack_security', points: 14, why_bad: '攻め案だが秘密情報・認証・決済リスクが残る。' });
  }
  if (candidate.angle === 'defense' && /拡大|売上|成長|攻め|scale|growth/i.test(context.question || '')) {
    deductions.push({ key: 'defense_growth_drag', points: 8, why_bad: '守りに寄りすぎると成長機会を逃す。' });
  }
  if (candidate.angle === 'bad_hand') {
    deductions.push({ key: 'intentional_bad_hand', points: 35, why_bad: '悪手案。採用ではなく、事故パターンの可視化が目的。' });
  }
  if (candidate.angle === 'opposition' && unconfirmed >= 2) {
    deductions.push({ key: 'opposition_overblocks', points: 8, why_bad: '未確認が多い状況で反対に寄りすぎると停止しやすい。' });
  }
  if (candidate.angle === 'third_way' && riskKeys.length >= 3) {
    deductions.push({ key: 'third_way_complexity', points: 10, why_bad: '第三案は複雑化しやすく、高リスク時は運用負担が増える。' });
  }
  if (unhealthy) deductions.push({ key: 'question_health', points: 10, why_bad: '問いの前提・成功条件不足。' });
  if (unconfirmed) deductions.push({ key: 'unconfirmed', points: Math.min(18, unconfirmed * 4), why_bad: '未確認情報が残る。' });
  if (moodScore < 0 && candidate.angle === 'attack') deductions.push({ key: 'mood_attack', points: Math.abs(moodScore) * 5, why_bad: '不調時の攻め案は判断ミスが増える。' });

  const penalty = deductions.reduce((sum, item) => sum + item.points, 0);
  const score = Math.max(0, Math.min(100, candidate.base - penalty));
  return {
    ...candidate,
    score,
    answer_line_distance: 100 - score,
    score_breakdown: deductions,
    rank_reason: score >= 80 ? '採用候補' : score >= 60 ? '条件付き候補' : '事故確認用'
  };
}

async function run({ question = '', facts = {}, risks = {}, inquiry = {}, multi = {}, mood = {}, human = {}, domain = {} }) {
  const riskKeys = baseRisks(risks);
  const recommended = multi.recommended || 'balanced';
  const highPressure = human.mode === 'high_pressure' || mood.score < 0;
  const domainChecks = Array.isArray(domain.primary?.evidence_to_collect) ? domain.primary.evidence_to_collect.slice(0, 3) : [];
  const domainName = domain.primary?.name || 'General Judgment / Default';

  const candidates = [
    makeCandidate({
      id: 'mainline',
      label: '主案',
      angle: recommended,
      thesis: `自動判定された${domainName}レンズと5本柱分析に沿って、最短で成果に近い案を選ぶ。`,
      strengths: ['実装しやすい', '既存の認知マップと整合する', '説明コストが低い'],
      failure_modes: ['既存前提の誤りを引きずる', '大胆さが不足する'],
      required_checks: ['目的', '対象', '成功条件', ...domainChecks],
      base: 86
    }),
    makeCandidate({
      id: 'bad_hand',
      label: '悪手案',
      angle: 'bad_hand',
      thesis: 'あえて雑に全部盛り・無検証・即公開へ寄せた場合の事故を先に見える化する。',
      strengths: ['地雷が見える', '失敗パターンを素材化できる'],
      failure_modes: ['仕様膨張', '秘密情報漏洩', '未検証の完成宣言'],
      required_checks: ['ログマスキング', '本番設定', '検証範囲'] ,
      base: 68
    }),
    makeCandidate({
      id: 'opposition',
      label: '反対案',
      angle: 'opposition',
      thesis: `いったん止めて、${domainName}で必要な未確認・矛盾・運用負荷を潰してから進める。`,
      strengths: ['事故耐性が高い', '法務・決済・認証に強い'],
      failure_modes: ['前進速度が落ちる', '過剰防衛で価値が薄まる'],
      required_checks: ['未確認情報', 'リスク上位', '依存関係'],
      base: riskKeys.length ? 84 : 76
    }),
    makeCandidate({
      id: 'third_way',
      label: '第三案',
      angle: 'third_way',
      thesis: `核は維持しつつ、${domainName}で必要な専門チェックだけを追加して段階的に進める。`,
      strengths: ['完成速度と独自性の両立', '既存基盤を壊しにくい', 'Phase拡張しやすい'],
      failure_modes: ['設計文書と実装の二重管理', 'Compareが複雑化する'],
      required_checks: ['dialectic出力', 'Compare統合', 'テスト追加'],
      base: 90
    }),
    makeCandidate({
      id: 'human_fit',
      label: '人読み最適案',
      angle: 'human_fit',
      thesis: highPressure
        ? '相手の負荷が高い前提で、問い返しを抑え、全部入り成果物と検証結果を先に返す。'
        : '相手の状態を読み、説明量・問い返し量・次アクションを調整する。',
      strengths: ['相手の状態に合う', '迷いを減らす', '実行に移しやすい'],
      failure_modes: ['推定を事実扱いすると危険', '読み違い時に過剰最適化する'],
      required_checks: ['mood confidence', 'human signals', 'response policy'],
      base: highPressure ? 88 : 82
    })
  ].map((candidate) => scoreCandidate(candidate, { question, facts, risks, inquiry, multi, mood, human }));

  const ranked = candidates.sort((a, b) => b.score - a.score);
  return {
    pillar: 'dialectic',
    engine: 'Hyperion-Core v2 / PCE-DCE',
    mode: 'max_firepower',
    description: '自動選択された用途テンプレートを前提に、主案・悪手案・反対案・第三案・人読み最適案を並列候補として生成し、Compareへ渡す。',
    domain_template: domain.primary ? { id: domain.primary.id, name: domain.primary.name } : null,
    selected: ranked[0],
    candidates: ranked,
    bad_hand_lessons: ranked.find((x) => x.id === 'bad_hand')?.failure_modes || [],
    integration_rule: '悪手は採用候補ではなく、事故検出・改善素材として保存する。'
  };
}

module.exports = { run };

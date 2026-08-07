import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { SubmissionDetail } from '../collect/reports.js';

/**
 * 채점 초안 생성.
 *
 * 여기서 나온 점수는 **초안**이다. 사람 검토(status='approved') 없이는
 * 어떤 경로로도 LMS에 반영되지 않는다. 최종 책임은 교수자에게 있다.
 */

export interface Rubric {
  id: string;
  title: string;
  maxScore: number;
  /** 사람이 직접 작성한 채점 기준 (grade/rubrics/*.md) */
  criteria: string;
}

export interface Draft {
  score: number;
  reasoning: string;
  feedback: string;
}

const SYSTEM = `당신은 대학 교수의 채점을 보조합니다.
주어진 루브릭에 따라 학생 제출물을 평가하고 점수 초안과 근거, 학생용 피드백을 제시하세요.

원칙:
- 루브릭에 명시되지 않은 기준으로 감점하지 마세요.
- 근거(reasoning)에는 제출물의 어느 부분이 어느 항목에 해당하는지 구체적으로 쓰세요. 교수가 이걸 보고 검증합니다.
- 판단이 어려운 부분은 점수를 임의로 정하지 말고 근거에 "교수 확인 필요"라고 명시하세요.
- 피드백은 학생에게 그대로 전달될 수 있는 존중하는 어조로 작성하세요.`;

export async function generateDraft(rubric: Rubric, submission: SubmissionDetail): Promise<Draft> {
  if (!config.anthropicApiKey) {
    throw new Error('.env 에 ANTHROPIC_API_KEY 를 설정하세요.');
  }
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const attachmentNote =
    submission.attachments.length > 0
      ? `\n\n[첨부파일] ${submission.attachments.map((a) => a.name).join(', ')}\n(첨부 내용은 별도 확인이 필요합니다)`
      : '';

  const message = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content:
          `## 과제: ${rubric.title} (만점 ${rubric.maxScore}점)\n\n` +
          `## 채점 기준\n${rubric.criteria}\n\n` +
          `## 학생 제출물\n${submission.body}${attachmentNote}\n\n` +
          `아래 JSON 형식으로만 답하세요:\n` +
          `{"score": <0~${rubric.maxScore} 사이 숫자>, "reasoning": "<채점 근거>", "feedback": "<학생용 피드백>"}`,
      },
    ],
  });

  const block = message.content.find((c) => c.type === 'text');
  if (!block || block.type !== 'text') throw new Error('모델 응답에 텍스트가 없습니다.');

  const json = block.text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`모델 응답을 JSON으로 해석할 수 없습니다:\n${block.text.slice(0, 300)}`);

  const draft = JSON.parse(json) as Draft;

  // 범위 검증 — 만점 초과나 음수를 그대로 저장하면 검토 단계에서 놓치기 쉽다.
  if (typeof draft.score !== 'number' || Number.isNaN(draft.score)) {
    throw new Error('초안 점수가 숫자가 아닙니다.');
  }
  if (draft.score < 0 || draft.score > rubric.maxScore) {
    throw new Error(`초안 점수 ${draft.score} 가 유효 범위(0~${rubric.maxScore})를 벗어났습니다.`);
  }

  return draft;
}

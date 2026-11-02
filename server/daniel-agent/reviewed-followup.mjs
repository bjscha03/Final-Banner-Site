import { generateDraft } from './ai.mjs';
import { reviewFollowup } from './followup-review.mjs';
import { currentFollowupReview } from './recovery-policy.mjs';
import { FOLLOWUP_EDITORIAL_BRIEF } from './followup-quality.mjs';

export async function generateReviewedFollowup(sql,contactId,env,{generator=generateDraft,reviewer=reviewFollowup}={}) {
  const [knowledge]=await sql`SELECT * FROM daniel_sales.knowledge ORDER BY created_at DESC LIMIT 1`;
  let feedback=FOLLOWUP_EDITORIAL_BRIEF,generated;
  for(let revision=0;revision<3;revision++) {
    generated=await generator(sql,contactId,'followup',env,undefined,0,feedback);
    generated.ai_metadata.followup_revision_count=revision+1;
    if(generated.ai_metadata.requires_approval!==false || generated.ai_metadata.model_requires_approval!==false)
      return generated;
    const review=await reviewer(sql,generated,knowledge,env);
    generated.ai_metadata.followup_review=review;
    if(currentFollowupReview(generated)) return generated;
    if(!review.response_id && review.deterministic!==true) throw Error('Independent follow-up review unavailable or conversation is no longer eligible');
    feedback=FOLLOWUP_EDITORIAL_BRIEF+'\nThe preceding draft was rejected: '+String(review.reason || 'No reliable approval')+'\nCorrect that specific defect. Do not invent a need, remove legitimate approval requirements, or repeat the rejected draft.';
  }
  // Keep the final rejection and draft for review. Never override the reviewer,
  // reset history, or try indefinitely until a model happens to approve.
  generated.requires_approval=true;
  generated.ai_metadata.requires_approval=true;
  generated.ai_metadata.editorial_hold='Three bounded editorial attempts did not approve the content.';
  return generated;
}

import { generateDraft } from './ai.mjs';
import { reviewFollowup } from './followup-review.mjs';
import { currentFollowupReview } from './recovery-policy.mjs';

export async function generateReviewedFollowup(sql,contactId,env,{generator=generateDraft,reviewer=reviewFollowup}={}) {
  const [knowledge]=await sql`SELECT * FROM daniel_sales.knowledge ORDER BY created_at DESC LIMIT 1`;
  let feedback=null,generated;
  for(let revision=0;revision<3;revision++) {
    generated=await generator(sql,contactId,'followup',env,undefined,0,feedback);
    generated.ai_metadata.followup_revision_count=revision+1;
    if(generated.ai_metadata.requires_approval!==false || generated.ai_metadata.model_requires_approval!==false)
      return generated;
    const review=await reviewer(sql,generated,knowledge,env);
    generated.ai_metadata.followup_review=review;
    if(currentFollowupReview(generated)) return generated;
    if(!review.response_id) throw Error('Independent follow-up review unavailable or conversation is no longer eligible');
    feedback='The independent follow-up reviewer rejected the previous draft: '+String(review.reason || 'No reliable approval')+'. Correct the specific problem using only the actually sent conversation and approved facts. Do not repeat the pitch, offer or procurement question. Do not invent a need or weaken approval rules.';
  }
  // Keep the final rejection and draft for review. Never override the reviewer,
  // reset history, or try indefinitely until a model happens to approve.
  generated.requires_approval=true;
  generated.ai_metadata.requires_approval=true;
  generated.ai_metadata.editorial_hold='Three independent follow-up reviews did not approve the content.';
  return generated;
}

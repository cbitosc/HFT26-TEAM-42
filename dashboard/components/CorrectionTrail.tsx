import correction from "../../shared/baked/correction.json";
import { bakedMemory } from "@/lib/baked";
import { etherscanTx } from "@/lib/chain";

// Every number here is the output of `python -m agent challenge-lesson`, in shared/baked/correction.json.
export function CorrectionTrail({ onOpen }: { onOpen: (id: string) => void }) {
  const entry = bakedMemory.find((item) => item.entry_id === correction.entry_id);
  if (!entry || !correction.evidence) return null;
  const { trials } = correction;
  return (
    <section className="correction" aria-label="Self-correction">
      <h2 className="label">Self-correction, on-chain</h2>
      <p>
        We planted a wrong lesson on a real, proven gain, labelled as a test. The proof verified, because it covers the
        score and not the explanation. Agent B then tested the lesson and the memory corrected itself.
      </p>
      <ol>
        <li>
          <strong>
            {correction.failed_with}/{trials}
          </strong>
          <span>runs failed the expiry test with the lesson</span>
        </li>
        <li>
          <strong>
            {correction.failed_without}/{trials}
          </strong>
          <span>failed without it</span>
        </li>
        <li>
          <strong>Disputed</strong>
          <span>
            <a href={etherscanTx(correction.evidence.tx)} target="_blank" rel="noreferrer">
              Contradiction on Sepolia
            </a>
            , no longer recommended
          </span>
        </li>
        <li>
          <strong>
            {correction.failed_after_correction}/{trials}
          </strong>
          <span>failed once agents stopped receiving it</span>
        </li>
      </ol>
      <p>
        <button type="button" onClick={() => onOpen(entry.entry_id)}>
          Open the disputed entry
        </button>
      </p>
    </section>
  );
}

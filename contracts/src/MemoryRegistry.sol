// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMemoryRegistry} from "./IMemoryRegistry.sol";
import {RewardEscrow} from "./RewardEscrow.sol";

interface IProofVerifier {
    function verifyProof(bytes calldata proof, uint256[] calldata instances) external returns (bool);
}

contract MemoryRegistry is IMemoryRegistry {
    error EntryExists();
    error EmptyCid();
    error BadCommitment();
    error BadInstances();
    error ProofInvalid();
    error ProofReused();
    error UnknownEntry();
    error InvalidReporter();
    error DuplicateEvidence();

    uint256 public constant MAX_ENTRIES_VIEW = 200;

    IProofVerifier public immutable verifier;
    RewardEscrow public immutable escrow;

    mapping(bytes32 entryId => Entry) private entries;
    mapping(bytes32 taskSignature => bytes32[]) private taskEntries;
    mapping(bytes32 proofHash => bool) public proofUsed;
    mapping(address reporter => mapping(bytes32 reusedEntryId => bool)) public evidencePosted;

    constructor(IProofVerifier verifier_, RewardEscrow escrow_) {
        verifier = verifier_;
        escrow = escrow_;
    }

    function submitImprovement(
        bytes32 entryId,
        bytes32 taskSignature,
        string calldata cid,
        bytes32 scoreHashOld,
        bytes32 scoreHashNew,
        bytes calldata proof,
        uint256[] calldata instances,
        bytes32 supersedes
    ) external {
        _checkNew(entryId, cid);
        // Memory commitment: ties the CID, scores, task and author to this entry.
        if (entryId != keccak256(abi.encodePacked(cid, scoreHashOld, scoreHashNew, taskSignature, msg.sender))) {
            revert BadCommitment();
        }

        // Layout: [h_old, h_new, improved]. See docs/04-TRACK-ZK.md.
        if (
            instances.length != 3 || instances[0] != uint256(scoreHashOld) || instances[1] != uint256(scoreHashNew)
                || instances[2] != 1
        ) revert BadInstances();

        // entryId alone cannot stop replay: a new CID gives a new entryId for the same proof.
        bytes32 proofHash = keccak256(proof);
        if (proofUsed[proofHash]) revert ProofReused();
        proofUsed[proofHash] = true;

        // The generated verifier reverts on a bad proof rather than returning false.
        try verifier.verifyProof(proof, instances) returns (bool ok) {
            if (!ok) revert ProofInvalid();
        } catch {
            revert ProofInvalid();
        }

        _store(entryId, taskSignature, cid, scoreHashOld, scoreHashNew, true, supersedes);

        uint256 paid = escrow.payReward(msg.sender);
        if (paid > 0) emit RewardPaid(entryId, msg.sender, paid);
    }

    function submitNegative(bytes32 entryId, bytes32 taskSignature, string calldata cid, bytes32 supersedes) external {
        _checkNew(entryId, cid);
        // No score hashes on negative memory. The author binding stops anyone squatting a pending entryId.
        if (entryId != keccak256(abi.encodePacked(cid, taskSignature, msg.sender))) revert BadCommitment();
        _store(entryId, taskSignature, cid, bytes32(0), bytes32(0), false, supersedes);
    }

    function postEvidence(bytes32 reusedEntryId, bool supported, bytes32 reporterEntryId) external {
        Entry storage reused = entries[reusedEntryId];
        if (reused.author == address(0)) revert UnknownEntry();

        Entry storage reporter = entries[reporterEntryId];
        if (reusedEntryId == reporterEntryId || !reporter.verified || reporter.author != msg.sender) {
            revert InvalidReporter();
        }
        if (evidencePosted[msg.sender][reusedEntryId]) revert DuplicateEvidence();
        evidencePosted[msg.sender][reusedEntryId] = true;

        if (supported) reused.supported++;
        else reused.contradicted++;

        reused.tier = _nextTier(reused);
        emit EvidencePosted(reusedEntryId, msg.sender, supported, reused.tier);
    }

    function getEntry(bytes32 entryId) external view returns (Entry memory) {
        return entries[entryId];
    }

    /// Returns the most recent entries, capped at MAX_ENTRIES_VIEW.
    function entriesByTask(bytes32 taskSignature) external view returns (bytes32[] memory ids) {
        bytes32[] storage all = taskEntries[taskSignature];
        uint256 count = all.length < MAX_ENTRIES_VIEW ? all.length : MAX_ENTRIES_VIEW;
        ids = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = all[all.length - count + i];
        }
    }

    function _checkNew(bytes32 entryId, string calldata cid) private view {
        if (entries[entryId].author != address(0)) revert EntryExists();
        if (bytes(cid).length == 0) revert EmptyCid();
    }

    function _store(
        bytes32 entryId,
        bytes32 taskSignature,
        string calldata cid,
        bytes32 scoreHashOld,
        bytes32 scoreHashNew,
        bool verified,
        bytes32 supersedes
    ) private {
        Entry storage entry = entries[entryId];
        entry.author = msg.sender;
        entry.taskSignature = taskSignature;
        entry.cid = cid;
        entry.scoreHashOld = scoreHashOld;
        entry.scoreHashNew = scoreHashNew;
        entry.verified = verified;
        entry.supersedes = supersedes;
        entry.createdAt = uint64(block.timestamp);
        taskEntries[taskSignature].push(entryId);
        emit ImprovementRecorded(entryId, msg.sender, taskSignature, cid, verified);
    }

    /// Promotes on net supported count, demotes one tier when contradictions lead.
    function _nextTier(Entry storage entry) private view returns (Tier) {
        Tier tier = entry.tier;
        if (entry.contradicted > entry.supported) {
            return tier == Tier.Candidate ? tier : Tier(uint8(tier) - 1);
        }
        uint32 net = entry.supported - entry.contradicted;
        Tier earned = Tier(net > 3 ? 3 : net);
        return earned > tier ? earned : tier;
    }
}

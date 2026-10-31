// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Frozen external interface. See docs/02-INTERFACES.md.
interface IMemoryRegistry {
    enum Tier { Candidate, Validated, Trusted, Canonical }

    struct Entry {
        address author;
        bytes32 taskSignature;     // keccak256(task_signature string)
        string  cid;               // IPFS CID of the memory entry
        bytes32 scoreHashOld;
        bytes32 scoreHashNew;
        bool    verified;          // false for negative memory
        Tier    tier;
        uint32  supported;         // verified reuse count
        uint32  contradicted;
        bytes32 supersedes;        // entryId or 0
        uint64  createdAt;
    }

    event ImprovementRecorded(bytes32 indexed entryId, address indexed author, bytes32 indexed taskSignature, string cid, bool verified);
    event EvidencePosted(bytes32 indexed entryId, address indexed reporter, bool supported, Tier newTier);
    event RewardPaid(bytes32 indexed entryId, address indexed to, uint256 amount);

    function submitImprovement(
        bytes32 entryId,
        bytes32 taskSignature,
        string calldata cid,
        bytes32 scoreHashOld,
        bytes32 scoreHashNew,
        bytes calldata proof,
        uint256[] calldata instances,   // layout defined in docs/04-TRACK-ZK.md
        bytes32 supersedes
    ) external;

    function submitNegative(bytes32 entryId, bytes32 taskSignature, string calldata cid, bytes32 supersedes) external;

    function postEvidence(bytes32 reusedEntryId, bool supported, bytes32 reporterEntryId) external;

    function getEntry(bytes32 entryId) external view returns (Entry memory);
    function entriesByTask(bytes32 taskSignature) external view returns (bytes32[] memory);
}

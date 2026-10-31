// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IMemoryRegistry} from "../src/IMemoryRegistry.sol";
import {IProofVerifier, MemoryRegistry} from "../src/MemoryRegistry.sol";
import {RewardEscrow} from "../src/RewardEscrow.sol";

contract MockVerifier is IProofVerifier {
    enum Mode { Accept, ReturnFalse, Revert }

    Mode public mode;

    function setMode(Mode mode_) external {
        mode = mode_;
    }

    function verifyProof(bytes calldata, uint256[] calldata) external view returns (bool) {
        if (mode == Mode.Revert) revert();
        return mode == Mode.Accept;
    }
}

/// Tries to claim a second reward from inside the first payout.
contract ReentrantAuthor {
    MemoryRegistry public registry;
    bytes32 public entryId;
    uint256[] public instances;
    bool public attempted;
    bool public reentered;

    constructor(MemoryRegistry registry_, uint256[] memory instances_) {
        registry = registry_;
        instances = instances_;
    }

    function submit(bytes32 id, bytes32 task, string calldata cid) external {
        entryId = id;
        registry.submitImprovement(id, task, cid, bytes32(instances[0]), bytes32(instances[1]), "p", instances, 0);
    }

    receive() external payable {
        if (attempted) return;
        attempted = true;
        bytes32 task = keccak256("lru-cache");
        try registry.submitImprovement(entryId, task, "cid", bytes32(instances[0]), bytes32(instances[1]), "p2", instances, 0) {
            reentered = true;
        } catch {}
    }
}

contract MemoryRegistryTest is Test {
    MockVerifier verifier;
    RewardEscrow escrow;
    MemoryRegistry registry;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    bytes32 task = keccak256("lru-cache");
    bytes32 hOld = bytes32(uint256(111));
    bytes32 hNew = bytes32(uint256(222));

    function setUp() public {
        verifier = new MockVerifier();
        escrow = new RewardEscrow(address(this));
        registry = new MemoryRegistry(verifier, escrow);
        escrow.setRegistry(address(registry));
        vm.deal(address(escrow), 1 ether);
    }

    function _id(string memory cid, address author) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(cid, hOld, hNew, task, author));
    }

    function _negativeId(string memory cid, address author) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(cid, task, author));
    }

    function _instances() internal view returns (uint256[] memory instances) {
        instances = new uint256[](3);
        instances[0] = uint256(hOld);
        instances[1] = uint256(hNew);
        instances[2] = 1;
    }

    /// Each proof must be unique, so derive it from the cid.
    function _submit(address author, string memory cid) internal returns (bytes32 id) {
        id = _id(cid, author);
        vm.prank(author);
        registry.submitImprovement(id, task, cid, hOld, hNew, bytes(cid), _instances(), 0);
    }

    function test_SubmitStoresEntryAndPays() public {
        vm.expectEmit(true, true, true, true);
        emit IMemoryRegistry.RewardPaid(_id("cid-1", alice), alice, 0.001 ether);
        bytes32 id = _submit(alice, "cid-1");

        IMemoryRegistry.Entry memory entry = registry.getEntry(id);
        assertEq(entry.author, alice);
        assertEq(entry.cid, "cid-1");
        assertTrue(entry.verified);
        assertEq(uint8(entry.tier), uint8(IMemoryRegistry.Tier.Candidate));
        assertEq(entry.createdAt, block.timestamp);
        assertEq(alice.balance, 0.001 ether);
        assertEq(registry.entriesByTask(task)[0], id);
    }

    function test_RevertsOnDuplicateEntry() public {
        bytes32 id = _submit(alice, "cid-1");
        vm.prank(alice);
        vm.expectRevert(MemoryRegistry.EntryExists.selector);
        registry.submitImprovement(id, task, "cid-1", hOld, hNew, "other", _instances(), 0);
        assertEq(alice.balance, 0.001 ether);
    }

    function test_RevertsOnEmptyCid() public {
        bytes32 id = _id("", alice);
        vm.prank(alice);
        vm.expectRevert(MemoryRegistry.EmptyCid.selector);
        registry.submitImprovement(id, task, "", hOld, hNew, "p", _instances(), 0);
    }

    function test_RevertsWhenCommitmentDoesNotMatch() public {
        // Each committed field in turn: swapped CID, scores, task, author.
        vm.startPrank(alice);
        bytes32 id = _id("cid-1", alice);
        vm.expectRevert(MemoryRegistry.BadCommitment.selector);
        registry.submitImprovement(id, task, "cid-2", hOld, hNew, "p", _instances(), 0);
        vm.expectRevert(MemoryRegistry.BadCommitment.selector);
        registry.submitImprovement(id, task, "cid-1", hNew, hOld, "p", _instances(), 0);
        vm.expectRevert(MemoryRegistry.BadCommitment.selector);
        registry.submitImprovement(id, keccak256("ttl-cache"), "cid-1", hOld, hNew, "p", _instances(), 0);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(MemoryRegistry.BadCommitment.selector);
        registry.submitImprovement(id, task, "cid-1", hOld, hNew, "p", _instances(), 0);
    }

    function test_RevertsOnBadInstances() public {
        bytes32 id = _id("cid-1", alice);
        vm.startPrank(alice);

        uint256[] memory instances = _instances();
        instances[0] = 999;
        vm.expectRevert(MemoryRegistry.BadInstances.selector);
        registry.submitImprovement(id, task, "cid-1", hOld, hNew, "p", instances, 0);

        instances = _instances();
        instances[1] = 999;
        vm.expectRevert(MemoryRegistry.BadInstances.selector);
        registry.submitImprovement(id, task, "cid-1", hOld, hNew, "p", instances, 0);

        instances = _instances();
        instances[2] = 0;
        vm.expectRevert(MemoryRegistry.BadInstances.selector);
        registry.submitImprovement(id, task, "cid-1", hOld, hNew, "p", instances, 0);

        vm.expectRevert(MemoryRegistry.BadInstances.selector);
        registry.submitImprovement(id, task, "cid-1", hOld, hNew, "p", new uint256[](2), 0);
    }

    function test_RevertsWhenVerifierRejects() public {
        bytes32 id = _id("cid-1", alice);
        vm.startPrank(alice);

        verifier.setMode(MockVerifier.Mode.ReturnFalse);
        vm.expectRevert(MemoryRegistry.ProofInvalid.selector);
        registry.submitImprovement(id, task, "cid-1", hOld, hNew, "p", _instances(), 0);

        verifier.setMode(MockVerifier.Mode.Revert);
        vm.expectRevert(MemoryRegistry.ProofInvalid.selector);
        registry.submitImprovement(id, task, "cid-1", hOld, hNew, "p", _instances(), 0);
    }

    function test_FailedProofDoesNotBurnProofHash() public {
        bytes32 id = _id("cid-1", alice);
        vm.startPrank(alice);
        verifier.setMode(MockVerifier.Mode.ReturnFalse);
        vm.expectRevert(MemoryRegistry.ProofInvalid.selector);
        registry.submitImprovement(id, task, "cid-1", hOld, hNew, "p", _instances(), 0);
        assertFalse(registry.proofUsed(keccak256("p")));
    }

    function test_RevertsOnReplayedProofUnderNewCid() public {
        vm.startPrank(alice);
        registry.submitImprovement(_id("cid-1", alice), task, "cid-1", hOld, hNew, "same-proof", _instances(), 0);
        vm.expectRevert(MemoryRegistry.ProofReused.selector);
        registry.submitImprovement(_id("cid-2", alice), task, "cid-2", hOld, hNew, "same-proof", _instances(), 0);
        vm.stopPrank();
        assertEq(alice.balance, 0.001 ether);
    }

    function test_ReentrantAuthorCannotDoubleClaim() public {
        ReentrantAuthor author = new ReentrantAuthor(registry, _instances());
        author.submit(_id("cid-1", address(author)), task, "cid-1");
        assertTrue(author.attempted());
        assertFalse(author.reentered());
        assertEq(address(author).balance, 0.001 ether);
    }

    function test_RewardFailureDoesNotBlockMemory() public {
        escrow.withdraw(payable(address(this)), 1 ether);
        bytes32 id = _submit(alice, "cid-1");
        assertTrue(registry.getEntry(id).verified);
        assertEq(alice.balance, 0);
    }

    function test_NegativeStoresUnverifiedWithoutReward() public {
        bytes32 id = _negativeId("cid-neg", alice);
        vm.prank(alice);
        registry.submitNegative(id, task, "cid-neg", 0);
        assertFalse(registry.getEntry(id).verified);
        assertEq(alice.balance, 0);
    }

    function test_NegativeCannotSquatPendingEntryId() public {
        bytes32 pending = _id("cid-1", alice);
        vm.prank(bob);
        vm.expectRevert(MemoryRegistry.BadCommitment.selector);
        registry.submitNegative(pending, task, "cid-1", 0);
    }

    function test_SupersedesIsRecordedAndOldEntryKept() public {
        bytes32 first = _submit(alice, "cid-1");
        bytes32 second = _id("cid-2", alice);
        vm.prank(alice);
        registry.submitImprovement(second, task, "cid-2", hOld, hNew, "p2", _instances(), first);
        assertEq(registry.getEntry(second).supersedes, first);
        assertEq(registry.getEntry(first).author, alice);
    }

    function _reporters(uint256 count, bytes32 reused) internal {
        for (uint256 i = 0; i < count; i++) {
            address reporter = makeAddr(string.concat("reporter", vm.toString(i)));
            bytes32 reporterId = _submit(reporter, string.concat("cid-r", vm.toString(i)));
            vm.prank(reporter);
            registry.postEvidence(reused, true, reporterId);
        }
    }

    function test_TierProgression() public {
        bytes32 id = _submit(alice, "cid-1");

        _reporters(1, id);
        assertEq(uint8(registry.getEntry(id).tier), uint8(IMemoryRegistry.Tier.Validated));

        bytes32 r1 = _submit(makeAddr("next1"), "cid-n1");
        vm.prank(makeAddr("next1"));
        registry.postEvidence(id, true, r1);
        assertEq(uint8(registry.getEntry(id).tier), uint8(IMemoryRegistry.Tier.Trusted));

        bytes32 r2 = _submit(makeAddr("next2"), "cid-n2");
        vm.prank(makeAddr("next2"));
        registry.postEvidence(id, true, r2);
        assertEq(uint8(registry.getEntry(id).tier), uint8(IMemoryRegistry.Tier.Canonical));

        bytes32 r3 = _submit(makeAddr("next3"), "cid-n3");
        vm.prank(makeAddr("next3"));
        registry.postEvidence(id, true, r3);
        assertEq(uint8(registry.getEntry(id).tier), uint8(IMemoryRegistry.Tier.Canonical));
        assertEq(registry.getEntry(id).supported, 4);
    }

    function test_ContradictionsLeadingDemoteOneTier() public {
        bytes32 id = _submit(alice, "cid-1");
        _reporters(1, id);

        bytes32 c1 = _submit(makeAddr("c1"), "cid-c1");
        vm.prank(makeAddr("c1"));
        registry.postEvidence(id, false, c1);
        assertEq(uint8(registry.getEntry(id).tier), uint8(IMemoryRegistry.Tier.Validated));

        bytes32 c2 = _submit(makeAddr("c2"), "cid-c2");
        vm.prank(makeAddr("c2"));
        registry.postEvidence(id, false, c2);
        assertEq(uint8(registry.getEntry(id).tier), uint8(IMemoryRegistry.Tier.Candidate));

        bytes32 c3 = _submit(makeAddr("c3"), "cid-c3");
        vm.prank(makeAddr("c3"));
        registry.postEvidence(id, false, c3);
        assertEq(uint8(registry.getEntry(id).tier), uint8(IMemoryRegistry.Tier.Candidate));
        assertEq(registry.getEntry(id).contradicted, 3);
    }

    function test_EvidenceRequiresVerifiedReporterEntry() public {
        bytes32 id = _submit(alice, "cid-1");

        // Unknown reporter entry.
        vm.prank(bob);
        vm.expectRevert(MemoryRegistry.InvalidReporter.selector);
        registry.postEvidence(id, true, bytes32(uint256(5)));

        // Bob's entry exists but is unverified negative memory.
        bytes32 negative = _negativeId("cid-neg", bob);
        vm.startPrank(bob);
        registry.submitNegative(negative, task, "cid-neg", 0);
        vm.expectRevert(MemoryRegistry.InvalidReporter.selector);
        registry.postEvidence(id, true, negative);
        vm.stopPrank();

        // Bob cannot borrow someone else's verified entry.
        bytes32 carol = _submit(makeAddr("carol"), "cid-carol");
        vm.prank(bob);
        vm.expectRevert(MemoryRegistry.InvalidReporter.selector);
        registry.postEvidence(id, true, carol);
    }

    function test_EvidenceCannotCiteTheSameEntry() public {
        bytes32 id = _submit(alice, "cid-1");
        vm.prank(alice);
        vm.expectRevert(MemoryRegistry.InvalidReporter.selector);
        registry.postEvidence(id, true, id);
    }

    function test_EvidenceRevertsOnUnknownEntry() public {
        bytes32 reporter = _submit(bob, "cid-b");
        vm.prank(bob);
        vm.expectRevert(MemoryRegistry.UnknownEntry.selector);
        registry.postEvidence(bytes32(uint256(5)), true, reporter);
    }

    function test_DuplicateEvidenceRejected() public {
        bytes32 id = _submit(alice, "cid-1");
        bytes32 first = _submit(bob, "cid-b1");
        bytes32 second = _submit(bob, "cid-b2");
        vm.startPrank(bob);
        registry.postEvidence(id, true, first);
        vm.expectRevert(MemoryRegistry.DuplicateEvidence.selector);
        registry.postEvidence(id, true, second);
    }

    function test_EntriesByTaskReturnsMostRecent200() public {
        bytes32 last;
        for (uint256 i = 0; i < 205; i++) {
            bytes32 id = _negativeId(vm.toString(i), alice);
            vm.prank(alice);
            registry.submitNegative(id, task, vm.toString(i), 0);
            last = id;
        }
        bytes32[] memory ids = registry.entriesByTask(task);
        assertEq(ids.length, 200);
        assertEq(ids[199], last);
        assertEq(ids[0], _negativeId("5", alice));
    }

    receive() external payable {}
}

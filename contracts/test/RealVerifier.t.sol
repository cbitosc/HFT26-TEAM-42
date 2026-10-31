// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IProofVerifier, MemoryRegistry} from "../src/MemoryRegistry.sol";
import {RewardEscrow} from "../src/RewardEscrow.sol";
import {Halo2Verifier} from "../src/Verifier.sol";

/// Real EZKL verifier against the real proofs in shared/test_vectors.json.
contract RealVerifierTest is Test {
    Halo2Verifier verifier;
    RewardEscrow escrow;
    MemoryRegistry registry;
    string vectors;

    address alice = makeAddr("alice");
    bytes32 task = keccak256("lru-cache");
    string cid = "bafy-test";

    function setUp() public {
        verifier = new Halo2Verifier();
        escrow = new RewardEscrow(address(this));
        registry = new MemoryRegistry(IProofVerifier(address(verifier)), escrow);
        escrow.setRegistry(address(registry));
        vm.deal(address(escrow), 1 ether);
        vectors = vm.readFile("../shared/test_vectors.json");
    }

    function _proof(string memory name) internal view returns (bytes memory) {
        return vm.parseJsonBytes(vectors, string.concat(".", name, ".proof_hex"));
    }

    function _instances(string memory name) internal view returns (uint256[] memory) {
        return vm.parseJsonUintArray(vectors, string.concat(".", name, ".instances"));
    }

    function test_EzklHashesFitTheVectorLayout() public view {
        uint256[] memory instances = _instances("improved");
        assertEq(instances.length, 3);
        assertEq(bytes32(instances[0]), vm.parseJsonBytes32(vectors, ".improved.h_old"));
        assertEq(bytes32(instances[1]), vm.parseJsonBytes32(vectors, ".improved.h_new"));
        assertEq(instances[2], 1);
    }

    function test_AcceptsValidProof() public {
        assertTrue(verifier.verifyProof(_proof("improved"), _instances("improved")));
    }

    function test_RejectsTamperedProof() public {
        bytes memory proof = _proof("improved");
        proof[proof.length / 2] ^= 0x01;
        vm.expectRevert();
        verifier.verifyProof(proof, _instances("improved"));
    }

    function test_RejectsTamperedHash() public {
        uint256[] memory instances = _instances("improved");
        instances[1] += 1;
        vm.expectRevert();
        verifier.verifyProof(_proof("improved"), instances);
    }

    /// The soundness check: a non-improving proof cannot be passed off as improved=1.
    function test_RejectsForgedImprovedFlag() public {
        uint256[] memory instances = _instances("not_improved");
        assertEq(instances[2], 0);
        assertTrue(verifier.verifyProof(_proof("not_improved"), instances));

        instances[2] = 1;
        vm.expectRevert();
        verifier.verifyProof(_proof("not_improved"), instances);
    }

    function _submit(string memory name) internal {
        uint256[] memory instances = _instances(name);
        bytes32 hOld = bytes32(instances[0]);
        bytes32 hNew = bytes32(instances[1]);
        bytes32 id = keccak256(abi.encodePacked(cid, hOld, hNew, task, alice));
        vm.prank(alice);
        registry.submitImprovement(id, task, cid, hOld, hNew, _proof(name), instances, 0);
    }

    function test_RegistryAcceptsRealProofAndPays() public {
        _submit("improved");
        assertEq(alice.balance, 0.001 ether);
    }

    function test_RegistryRejectsRealNonImprovingProof() public {
        vm.expectRevert(MemoryRegistry.BadInstances.selector);
        _submit("not_improved");
    }
}

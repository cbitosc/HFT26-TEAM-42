// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IProofVerifier, MemoryRegistry} from "../src/MemoryRegistry.sol";
import {RewardEscrow} from "../src/RewardEscrow.sol";
import {Halo2Verifier} from "../src/Verifier.sol";

/// Deploys Verifier, Escrow and Registry, wires them, funds the escrow, writes the addresses.
/// forge script script/Deploy.s.sol --rpc-url sepolia --broadcast
contract Deploy is Script {
    uint256 constant SEPOLIA = 11155111;

    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 funding = vm.envOr("ESCROW_FUNDING_WEI", uint256(0.02 ether));
        address deployer = vm.addr(key);

        vm.startBroadcast(key);
        Halo2Verifier verifier = new Halo2Verifier();
        RewardEscrow escrow = new RewardEscrow(deployer);
        MemoryRegistry registry = new MemoryRegistry(IProofVerifier(address(verifier)), escrow);
        escrow.setRegistry(address(registry));
        (bool funded,) = address(escrow).call{value: funding}("");
        require(funded, "escrow funding failed");
        vm.stopBroadcast();

        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "deployBlock", block.number);
        vm.serializeAddress(json, "verifier", address(verifier));
        vm.serializeAddress(json, "escrow", address(escrow));
        string memory output = vm.serializeAddress(json, "registry", address(registry));

        string memory name = block.chainid == SEPOLIA ? "sepolia" : "local";
        string memory path = string.concat("../shared/deployments.", name, ".json");
        vm.writeJson(output, path);
        console.log("wrote", path);
    }
}

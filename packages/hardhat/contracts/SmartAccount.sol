// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract DailySavingKernel {
    function executeBatch(
        address dailySavingsAddress,
        bytes[] calldata calls
    ) external {
        // This contract is meant to be called via EIP-7702 delegatecall
        // so all state changes (msg.sender, storage, etc.) happen in EOA context

        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory result) = dailySavingsAddress.call(calls[i]);
            require(success, _getRevertMsg(result));
        }
    }

    function _getRevertMsg(bytes memory revertData) internal pure returns (string memory) {
        if (revertData.length < 68) return "Execution failed";
        assembly {
            revertData := add(revertData, 0x04)
        }
        return abi.decode(revertData, (string));
    }
}

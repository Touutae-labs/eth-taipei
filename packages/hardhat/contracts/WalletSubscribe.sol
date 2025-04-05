// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract WalletSubscription {
    address public immutable user;
    address public immutable receiver;
    uint256 public immutable amount;
    uint256 public immutable validUntil;
    uint256 public immutable nonce;
    bytes public signature;
    IERC20 public token;

    event Subscribed(address indexed user, address indexed receiver, uint256 amount);

    constructor(
        address _user,
        address _receiver,
        uint256 _amount,
        uint256 _validUntil,
        uint256 _nonce,
        bytes memory _signature,
        address _tokenAddress
    ) {
        user = _user;
        receiver = _receiver;
        amount = _amount;
        validUntil = _validUntil;
        nonce = _nonce;
        signature = _signature;
        token = IERC20(_tokenAddress);

        require(block.timestamp <= validUntil, "Signature expired");
        require(token.transferFrom(user, receiver, amount), "Token transfer failed");
        require(verifySignature(), "Invalid signature");

        emit Subscribed(user, receiver, amount);
    }

    function verifySignature() internal view returns (bool) {
        bytes32 messageHash = keccak256(abi.encodePacked(user, receiver, amount, validUntil, nonce));
        bytes32 ethSignedMessage = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        return recoverSigner(ethSignedMessage, signature) == user;
    }

    function recoverSigner(bytes32 hash, bytes memory sig) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(sig);
        return ecrecover(hash, v, r, s);
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "Invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

/// @title ZK Vault
/// @notice Stake cUSDT and keep the staked amount encrypted on-chain using Zama FHE.
/// @dev Users stake by calling cUSDT.confidentialTransferAndCall(vault, encryptedAmount, proof, abi.encode(lockSeconds)).
contract ZKVault is IERC7984Receiver, ZamaEthereumConfig {
    struct StakePosition {
        euint64 amount;
        uint64 unlockTime;
        bool active;
    }

    IERC7984 public immutable cusdt;

    mapping(address account => StakePosition) private _stakes;

    event Staked(address indexed account, uint64 unlockTime, euint64 amount);
    event Withdrawn(address indexed account, euint64 amount);

    error OnlyCusdt();
    error NoActiveStake();
    error StakeLocked(uint64 unlockTime);

    constructor(address cusdt_) {
        require(cusdt_ != address(0), "cUSDT is zero");
        cusdt = IERC7984(cusdt_);
    }

    function _callbackResult(bool ok) internal returns (ebool encryptedOk) {
        encryptedOk = FHE.asEbool(ok);
        FHE.allow(encryptedOk, msg.sender);
    }

    /// @notice Returns the encrypted stake position for a given account.
    /// @dev View methods must not depend on msg.sender, so the account is an explicit parameter.
    function getStake(address account) external view returns (euint64 amount, uint64 unlockTime, bool active) {
        StakePosition storage position = _stakes[account];
        return (position.amount, position.unlockTime, position.active);
    }

    /// @notice Receive hook for cUSDT confidential transfer callbacks.
    /// @param from The token sender (staker).
    /// @param amount The transferred encrypted amount.
    /// @param data ABI-encoded uint64 lock duration in seconds.
    function onConfidentialTransferReceived(
        address,
        address from,
        euint64 amount,
        bytes calldata data
    ) external override returns (ebool) {
        if (msg.sender != address(cusdt)) revert OnlyCusdt();
        if (data.length != 32) return _callbackResult(false);

        uint64 lockDuration = abi.decode(data, (uint64));
        if (lockDuration == 0) return _callbackResult(false);

        uint64 unlockTime = uint64(block.timestamp) + lockDuration;
        if (unlockTime < block.timestamp) return _callbackResult(false);

        StakePosition storage position = _stakes[from];

        if (!position.active) {
            position.active = true;
            position.unlockTime = unlockTime;
            position.amount = amount;

            FHE.allowThis(position.amount);
            FHE.allow(position.amount, from);

            emit Staked(from, unlockTime, amount);
            return _callbackResult(true);
        }

        if (unlockTime > position.unlockTime) position.unlockTime = unlockTime;

        position.amount = FHE.add(position.amount, amount);
        FHE.allowThis(position.amount);
        FHE.allow(position.amount, from);

        emit Staked(from, position.unlockTime, position.amount);
        return _callbackResult(true);
    }

    /// @notice Withdraw the full stake after the unlock time.
    function withdraw() external {
        StakePosition storage position = _stakes[msg.sender];
        if (!position.active) revert NoActiveStake();
        if (block.timestamp < position.unlockTime) revert StakeLocked(position.unlockTime);

        euint64 amount = position.amount;

        position.active = false;
        position.unlockTime = 0;
        position.amount = FHE.asEuint64(0);
        FHE.allowThis(position.amount);

        cusdt.confidentialTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }
}

# ZK Vault

ZK Vault is a confidential staking vault for cUSDT on the Zama FHEVM. Users stake a token amount that stays encrypted on-chain, choose a lock duration, and withdraw only after the unlock time.

## Overview

ZK Vault combines a confidential ERC7984 token (cUSDT) with a vault contract that accepts encrypted transfers and enforces time locks. The vault never stores plaintext amounts. The UI decrypts balances locally using the Zama relayer SDK and an EIP-712 signature.

## Problem It Solves

On-chain staking typically exposes balances and amounts, which leaks user strategy and liquidity data. ZK Vault keeps stake amounts confidential while still enforcing lockup and withdrawal rules on-chain.

## Goals

- Keep stake amounts encrypted end-to-end on-chain.
- Enforce lock durations with on-chain logic only.
- Provide a simple staking flow in both CLI and UI.
- Keep contract read functions deterministic and explicit (no hidden sender dependencies).

## Non-Goals

- Yield generation or reward distribution.
- Multi-token or multi-position vaults per user.
- Mainnet-grade economic security (this is a demo system).

## Key Advantages

- Confidentiality: stake amounts are stored as encrypted euint64 values.
- Simple staking model: one active position per address with accumulation.
- Deterministic unlock: withdrawal only after the unlock timestamp.
- Minimal trust: no privileged admin paths in the vault.
- Clean integration: contracts, tasks, tests, and UI are wired together.

## How It Works

1. cUSDT is an ERC7984 confidential token. Minting converts cleartext to encrypted euint64.
2. Users stake using `confidentialTransferAndCall` on cUSDT, passing:
   - encrypted amount handle
   - Zama proof bytes
   - ABI-encoded lock duration in seconds
3. The vault receives the callback, checks sender is cUSDT, validates duration, and stores:
   - encrypted amount
   - unlock timestamp
   - active flag
4. If a user stakes again, the vault:
   - adds encrypted amounts together
   - extends the unlock time if the new lock is longer
5. After the unlock timestamp, `withdraw()` transfers the encrypted amount back.

## Contracts

### `ConfidentialUSDT`

- ERC7984 token with encrypted balances.
- `mint(address,uint64)` for test/demo mints only.
- Acts as the transfer gateway for the vault.

### `ZKVault`

- Accepts `confidentialTransferAndCall` callbacks from cUSDT.
- Stores the encrypted amount as `euint64`.
- One active stake per account; subsequent stakes accumulate.
- Unlock is enforced by `block.timestamp`.
- `getStake(address)` is explicit and does not depend on `msg.sender`.

### `FHECounter`

Legacy sample contract left in the repo for reference and testing patterns.

## Frontend

The UI lives in `ui/` and targets Sepolia only.

- Wallet connection: RainbowKit + wagmi.
- Read calls: viem.
- Write calls: ethers v6.
- Confidential decryption: Zama relayer SDK.
- Storage: in-memory only (no local storage).
- Network: Sepolia RPC only.

Core UI flows:

- Enter cUSDT and vault addresses.
- Mint demo cUSDT to the connected wallet.
- Stake encrypted cUSDT with a lock duration.
- Decrypt and display wallet balance and staked amount.
- Withdraw after unlock.

## Tech Stack

- Smart contracts: Solidity 0.8.27, Hardhat, hardhat-deploy
- FHE tooling: @fhevm/solidity, @fhevm/hardhat-plugin
- Confidential token standard: ERC7984 (OpenZeppelin confidential contracts)
- Frontend: React + Vite + TypeScript
- Wallet/chain: wagmi, viem, RainbowKit
- Write layer: ethers v6
- Relayer: @zama-fhe/relayer-sdk
- Tests: mocha, chai, hardhat network helpers

## Repository Layout

- `contracts/` smart contracts
- `deploy/` deployment scripts
- `tasks/` Hardhat CLI tasks
- `test/` unit and integration tests
- `ui/` frontend app
- `scripts/` developer utilities
- `docs/` Zama documentation references

## Prerequisites

- Node.js 20+
- npm 7+
- Sepolia ETH for deployment and testing

## Environment Configuration

Create a `.env` in the repo root with:

- `PRIVATE_KEY` (private key only, no mnemonic)
- `INFURA_API_KEY`
- `ETHERSCAN_API_KEY` (optional)

The frontend does not use environment variables.

## Local Development

Install dependencies:

```bash
npm install
```

Compile contracts:

```bash
npm run compile
```

Run tests (local FHEVM mock):

```bash
npm run test
```

Start a local Hardhat node for contract work:

```bash
npm run chain
```

Deploy contracts to local node:

```bash
npm run deploy:localhost
```

Note: the UI is configured for Sepolia only, so local node testing is CLI/test focused.

## Sepolia Deployment

Deploy to Sepolia (after tests pass locally):

```bash
npm run deploy:sepolia
```

Verify on Etherscan:

```bash
npm run verify:sepolia <CONTRACT_ADDRESS>
```

## Sync Contract ABI and Addresses to UI

The UI ABI must be derived from the deployed contracts in `deployments/sepolia`.

Run:

```bash
npx ts-node scripts/sync-ui-contracts.ts
```

This updates:

- `ui/src/config/contracts.ts`
- default cUSDT and vault addresses
- ABI definitions for the UI

## Hardhat Tasks

Print deployed addresses:

```bash
npx hardhat task:zkvault:addresses --network sepolia
```

Mint demo cUSDT:

```bash
npx hardhat task:zkvault:mint --network sepolia --to <ADDRESS> --amount <UINT64>
```

Stake with lock duration:

```bash
npx hardhat task:zkvault:stake --network sepolia --amount <UINT64> --lock <SECONDS>
```

Read and decrypt your position:

```bash
npx hardhat task:zkvault:position --network sepolia
```

Withdraw after unlock:

```bash
npx hardhat task:zkvault:withdraw --network sepolia
```

## Frontend Usage

Install UI dependencies:

```bash
cd ui
npm install
```

Start the UI:

```bash
npm run dev
```

In the UI:

- Connect a wallet on Sepolia.
- Paste the cUSDT and vault addresses.
- Mint demo cUSDT.
- Stake with a lock duration.
- Wait for unlock and withdraw.

## Limitations and Known Constraints

- Only one active stake per address.
- Withdraw is all-or-nothing.
- Lock duration is cleartext; amount is encrypted.
- Amounts are limited to uint64.
- No reward logic or yield strategy.
- No audit; do not use for mainnet value.

## Security Notes

- The vault only accepts callbacks from the cUSDT contract address.
- Unlock time is enforced by block timestamp.
- Amounts are encrypted; addresses and timestamps are public.
- Always validate deployments and ABIs before using the UI.

## Future Roadmap

- Multiple concurrent stakes per address.
- Partial withdrawals and top-ups without reset.
- Reward module integration (configurable emissions).
- Additional confidential assets beyond cUSDT.
- Improved UI analytics and position history.
- Optional role-based minting for test networks.
- Formal audit and threat modeling pass.

## License

BSD-3-Clause-Clear. See `LICENSE`.

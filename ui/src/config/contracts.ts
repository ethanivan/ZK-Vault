export const SEPOLIA_CHAIN_ID = 11155111;

export const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export const DEFAULT_CUSDT_ADDRESS = '0x337be650200F84b72a38745541CFba4ABE500184' as const;
export const DEFAULT_VAULT_ADDRESS = '0xa9F99B56e864826C1E568b541DA2418742A935DD' as const;

export const CUSDT_ABI = [
  {
    inputs: [],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'confidentialBalanceOf',
    outputs: [{ internalType: 'euint64', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint64', name: 'amount', type: 'uint64' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'externalEuint64', name: 'encryptedAmount', type: 'bytes32' },
      { internalType: 'bytes', name: 'inputProof', type: 'bytes' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
    ],
    name: 'confidentialTransferAndCall',
    outputs: [{ internalType: 'euint64', name: 'transferred', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export const ZKVAULT_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'cusdt_', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [],
    name: 'cusdt',
    outputs: [{ internalType: 'contract IERC7984', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'getStake',
    outputs: [
      { internalType: 'euint64', name: 'amount', type: 'bytes32' },
      { internalType: 'uint64', name: 'unlockTime', type: 'uint64' },
      { internalType: 'bool', name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

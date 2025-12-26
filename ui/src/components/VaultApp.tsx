import { useEffect, useMemo, useState } from 'react';
import { Contract, ethers } from 'ethers';
import { getAddress, isAddress } from 'viem';
import { useAccount, useChainId, useReadContract } from 'wagmi';

import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CUSDT_ABI, DEFAULT_CUSDT_ADDRESS, DEFAULT_VAULT_ADDRESS, SEPOLIA_CHAIN_ID, ZERO_HASH, ZKVAULT_ABI } from '../config/contracts';
import { Header } from './Header';
import '../styles/VaultApp.css';

function parseUint64(value: string): bigint | null {
  if (!/^\d+$/.test(value)) return null;
  try {
    const parsed = BigInt(value);
    if (parsed < 0n || parsed > (1n << 64n) - 1n) return null;
    return parsed;
  } catch {
    return null;
  }
}

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts = [
    days ? `${days}d` : '',
    hours ? `${hours}h` : '',
    minutes ? `${minutes}m` : '',
    secs || (!days && !hours && !minutes) ? `${secs}s` : '',
  ].filter(Boolean);
  return parts.join(' ');
}

export function VaultApp() {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [cusdtInput, setCusdtInput] = useState<string>(DEFAULT_CUSDT_ADDRESS);
  const [vaultInput, setVaultInput] = useState<string>(DEFAULT_VAULT_ADDRESS);

  const cusdtAddress = useMemo(() => (isAddress(cusdtInput) ? getAddress(cusdtInput) : undefined), [cusdtInput]);
  const vaultAddress = useMemo(() => (isAddress(vaultInput) ? getAddress(vaultInput) : undefined), [vaultInput]);

  const { data: tokenName } = useReadContract({
    address: cusdtAddress,
    abi: CUSDT_ABI,
    functionName: 'name',
    query: { enabled: Boolean(cusdtAddress) },
  });

  const { data: tokenSymbol } = useReadContract({
    address: cusdtAddress,
    abi: CUSDT_ABI,
    functionName: 'symbol',
    query: { enabled: Boolean(cusdtAddress) },
  });

  const { data: encryptedBalance } = useReadContract({
    address: cusdtAddress,
    abi: CUSDT_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(cusdtAddress && address) },
  });

  const { data: stake } = useReadContract({
    address: vaultAddress,
    abi: ZKVAULT_ABI,
    functionName: 'getStake',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(vaultAddress && address) },
  });

  const [clearBalance, setClearBalance] = useState<bigint | null>(null);
  const [clearStaked, setClearStaked] = useState<bigint | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  const [mintAmount, setMintAmount] = useState('1000000');
  const [stakeAmount, setStakeAmount] = useState('1000000');
  const [lockSeconds, setLockSeconds] = useState('60');

  const [isMinting, setIsMinting] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const stakeEncrypted = stake?.[0] as `0x${string}` | undefined;
  const unlockTime = stake?.[1] as bigint | undefined;
  const stakeActive = stake?.[2] as boolean | undefined;

  useEffect(() => {
    let canceled = false;

    async function decryptAll() {
      setDecryptError(null);

      if (!instance || !signerPromise || !address) {
        setClearBalance(null);
        setClearStaked(null);
        return;
      }

      const signer = await signerPromise;
      if (!signer) return;

      async function decryptHandle(handle: string, contractAddress: string) {
        if (handle === ZERO_HASH) return 0n;
        const keypair = instance.generateKeypair();
        const handleContractPairs = [{ handle, contractAddress }];
        const startTimeStamp = Math.floor(Date.now() / 1000).toString();
        const durationDays = '1';
        const contractAddresses = [contractAddress];
        const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

        const signature = await signer.signTypedData(
          eip712.domain,
          { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
          eip712.message,
        );

        const result = await instance.userDecrypt(
          handleContractPairs,
          keypair.privateKey,
          keypair.publicKey,
          signature.replace('0x', ''),
          contractAddresses,
          address,
          startTimeStamp,
          durationDays,
        );

        const value = result[handle];
        return typeof value === 'bigint' ? value : BigInt(value);
      }

      setIsDecrypting(true);
      try {
        const [balance, staked] = await Promise.all([
          cusdtAddress && encryptedBalance ? decryptHandle(encryptedBalance as string, cusdtAddress) : Promise.resolve(null),
          vaultAddress && stakeEncrypted ? decryptHandle(stakeEncrypted as string, vaultAddress) : Promise.resolve(null),
        ]);

        if (canceled) return;
        setClearBalance(balance);
        setClearStaked(staked);
      } catch (e) {
        if (canceled) return;
        setDecryptError(e instanceof Error ? e.message : 'Failed to decrypt values');
        setClearBalance(null);
        setClearStaked(null);
      } finally {
        if (!canceled) setIsDecrypting(false);
      }
    }

    decryptAll();

    return () => {
      canceled = true;
    };
  }, [address, cusdtAddress, encryptedBalance, instance, signerPromise, stakeEncrypted, vaultAddress]);

  const isOnSepolia = chainId === SEPOLIA_CHAIN_ID;

  const canTransact = Boolean(
    isConnected && isOnSepolia && address && cusdtAddress && vaultAddress && signerPromise && instance && !zamaLoading,
  );

  const unlockMs = unlockTime ? Number(unlockTime) * 1000 : 0;
  const nowMs = Date.now();
  const secondsLeft = unlockMs > nowMs ? Math.ceil((unlockMs - nowMs) / 1000) : 0;

  async function mint() {
    if (!canTransact || !cusdtAddress || !address) return;
    const amount = parseUint64(mintAmount);
    if (amount === null) return;

    setIsMinting(true);
    setTxHash(null);
    try {
      const signer = await signerPromise;
      if (!signer) throw new Error('Signer not ready');
      const token = new Contract(cusdtAddress, CUSDT_ABI, signer);
      const tx = await token.mint(address, amount);
      setTxHash(tx.hash);
      await tx.wait();
    } finally {
      setIsMinting(false);
    }
  }

  async function stakeNow() {
    if (!canTransact || !cusdtAddress || !vaultAddress || !address || !instance) return;

    const amount = parseUint64(stakeAmount);
    const lock = parseUint64(lockSeconds);
    if (amount === null || lock === null || lock === 0n) return;

    setIsStaking(true);
    setTxHash(null);
    try {
      const signer = await signerPromise;
      if (!signer) throw new Error('Signer not ready');

      const buffer = instance.createEncryptedInput(cusdtAddress, address);
      buffer.add64(amount);
      const encrypted = await buffer.encrypt();

      const data = ethers.AbiCoder.defaultAbiCoder().encode(['uint64'], [lock]);

      const token = new Contract(cusdtAddress, CUSDT_ABI, signer);
      const tx = await token['confidentialTransferAndCall(address,bytes32,bytes,bytes)'](
        vaultAddress,
        encrypted.handles[0],
        encrypted.inputProof,
        data,
      );
      setTxHash(tx.hash);
      await tx.wait();
    } finally {
      setIsStaking(false);
    }
  }

  async function withdraw() {
    if (!canTransact || !vaultAddress) return;

    setIsWithdrawing(true);
    setTxHash(null);
    try {
      const signer = await signerPromise;
      if (!signer) throw new Error('Signer not ready');
      const vault = new Contract(vaultAddress, ZKVAULT_ABI, signer);
      const tx = await vault.withdraw();
      setTxHash(tx.hash);
      await tx.wait();
    } finally {
      setIsWithdrawing(false);
    }
  }

  return (
    <div className="vault-page">
      <Header />
      <main className="vault-main">
        <div className="vault-container">
          <section className="card">
            <h2 className="card-title">Contracts</h2>
            <div className="grid-2">
              <div className="field">
                <label className="label">cUSDT address (Sepolia)</label>
                <input
                  className="input"
                  value={cusdtInput}
                  onChange={(e) => setCusdtInput(e.target.value.trim())}
                  placeholder="0x..."
                />
                <div className="hint">{cusdtAddress ? `Valid: ${cusdtAddress}` : 'Enter a valid address'}</div>
              </div>
              <div className="field">
                <label className="label">Vault address (Sepolia)</label>
                <input
                  className="input"
                  value={vaultInput}
                  onChange={(e) => setVaultInput(e.target.value.trim())}
                  placeholder="0x..."
                />
                <div className="hint">{vaultAddress ? `Valid: ${vaultAddress}` : 'Enter a valid address'}</div>
              </div>
            </div>
            <div className="row">
              <div className="pill">
                Network: <span className={isOnSepolia ? 'ok' : 'warn'}>{isOnSepolia ? 'Sepolia' : `Chain ${chainId}`}</span>
              </div>
              <div className="pill">
                Relayer: <span className={zamaLoading ? 'warn' : 'ok'}>{zamaLoading ? 'Loading' : 'Ready'}</span>
              </div>
              {zamaError ? <div className="pill warn">Relayer error: {zamaError}</div> : null}
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Wallet</h2>
            <div className="row">
              <div className="pill">
                Token: <span>{tokenName ? String(tokenName) : '—'}</span> <span>{tokenSymbol ? `(${String(tokenSymbol)})` : ''}</span>
              </div>
              <div className="pill">
                Balance (decrypted):{' '}
                <span>{isDecrypting ? 'Decrypting…' : clearBalance === null ? '—' : clearBalance.toString()}</span>
              </div>
              {decryptError ? <div className="pill warn">Decrypt error: {decryptError}</div> : null}
            </div>

            <div className="grid-3">
              <div className="field">
                <label className="label">Mint amount (uint64)</label>
                <input className="input" value={mintAmount} onChange={(e) => setMintAmount(e.target.value.trim())} />
                <div className="hint">For demo/testing. Amount uses 6 decimals.</div>
              </div>
              <div className="field actions">
                <label className="label">&nbsp;</label>
                <button className="button" disabled={!canTransact || isMinting || parseUint64(mintAmount) === null} onClick={mint}>
                  {isMinting ? 'Minting…' : 'Mint cUSDT'}
                </button>
              </div>
              <div className="field">
                <label className="label">Last tx</label>
                <div className="mono">{txHash ?? '—'}</div>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Stake</h2>

            <div className="grid-3">
              <div className="field">
                <label className="label">Stake amount (uint64)</label>
                <input className="input" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value.trim())} />
                <div className="hint">Encrypted on-chain; amount uses 6 decimals.</div>
              </div>
              <div className="field">
                <label className="label">Lock duration (seconds)</label>
                <input className="input" value={lockSeconds} onChange={(e) => setLockSeconds(e.target.value.trim())} />
                <div className="hint">{parseUint64(lockSeconds) ? `≈ ${formatSeconds(Number(lockSeconds))}` : 'Enter an integer'}</div>
              </div>
              <div className="field actions">
                <label className="label">&nbsp;</label>
                <button
                  className="button primary"
                  disabled={
                    !canTransact ||
                    isStaking ||
                    parseUint64(stakeAmount) === null ||
                    parseUint64(lockSeconds) === null ||
                    parseUint64(lockSeconds) === 0n
                  }
                  onClick={stakeNow}
                >
                  {isStaking ? 'Staking…' : 'Stake'}
                </button>
              </div>
            </div>

            <div className="row">
              <div className="pill">
                Active: <span>{stakeActive === undefined ? '—' : stakeActive ? 'Yes' : 'No'}</span>
              </div>
              <div className="pill">
                Staked (decrypted): <span>{isDecrypting ? 'Decrypting…' : clearStaked === null ? '—' : clearStaked.toString()}</span>
              </div>
              <div className="pill">
                Unlock time:{' '}
                <span>
                  {unlockTime ? new Date(Number(unlockTime) * 1000).toLocaleString() : '—'}{' '}
                  {unlockTime ? `(in ${formatSeconds(secondsLeft)})` : ''}
                </span>
              </div>
              <div className="pill">
                <button className="button" disabled={!canTransact || isWithdrawing || !stakeActive || secondsLeft > 0} onClick={withdraw}>
                  {isWithdrawing ? 'Withdrawing…' : 'Withdraw'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";
import { ConfidentialUSDT, ConfidentialUSDT__factory, ZKVault, ZKVault__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const cusdtFactory = (await ethers.getContractFactory("ConfidentialUSDT")) as ConfidentialUSDT__factory;
  const cusdt = (await cusdtFactory.deploy()) as ConfidentialUSDT;
  const cusdtAddress = await cusdt.getAddress();

  const vaultFactory = (await ethers.getContractFactory("ZKVault")) as ZKVault__factory;
  const vault = (await vaultFactory.deploy(cusdtAddress)) as ZKVault;
  const vaultAddress = await vault.getAddress();

  return { cusdt, cusdtAddress, vault, vaultAddress };
}

describe("ZKVault", function () {
  let signers: Signers;
  let cusdt: ConfidentialUSDT;
  let cusdtAddress: string;
  let vault: ZKVault;
  let vaultAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ cusdt, cusdtAddress, vault, vaultAddress } = await deployFixture());
  });

  async function decryptEuint64(handle: string, contractAddress: string, signer: HardhatEthersSigner) {
    return await fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signer);
  }

  it("stakes via confidentialTransferAndCall and withdraws after unlock", async function () {
    await (await cusdt.mint(signers.alice.address, 1_000)).wait();

    const lockSeconds = 10;
    const stakeAmount = 250;
    const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint64"], [lockSeconds]);

    const encryptedInput = await fhevm
      .createEncryptedInput(cusdtAddress, signers.alice.address)
      .add64(stakeAmount)
      .encrypt();

    await (
      await cusdt
        .connect(signers.alice)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
          vaultAddress,
          encryptedInput.handles[0],
          encryptedInput.inputProof,
          data,
        )
    ).wait();

    const [encryptedStaked, unlockTime, active] = await vault.getStake(signers.alice.address);
    expect(active).to.eq(true);
    expect(Number(unlockTime)).to.be.greaterThan(0);

    const clearStaked = await decryptEuint64(encryptedStaked, vaultAddress, signers.alice);
    expect(clearStaked).to.eq(stakeAmount);

    const encryptedBalAfterStake = await cusdt.confidentialBalanceOf(signers.alice.address);
    const clearBalAfterStake = await decryptEuint64(encryptedBalAfterStake, cusdtAddress, signers.alice);
    expect(clearBalAfterStake).to.eq(1_000 - stakeAmount);

    await ethers.provider.send("evm_increaseTime", [lockSeconds]);
    await ethers.provider.send("evm_mine", []);

    await (await vault.connect(signers.alice).withdraw()).wait();

    const [, , activeAfter] = await vault.getStake(signers.alice.address);
    expect(activeAfter).to.eq(false);

    const encryptedBalAfterWithdraw = await cusdt.confidentialBalanceOf(signers.alice.address);
    const clearBalAfterWithdraw = await decryptEuint64(encryptedBalAfterWithdraw, cusdtAddress, signers.alice);
    expect(clearBalAfterWithdraw).to.eq(1_000);
  });

  it("reverts withdraw before unlock", async function () {
    await (await cusdt.mint(signers.alice.address, 100)).wait();

    const lockSeconds = 3600;
    const stakeAmount = 20;
    const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint64"], [lockSeconds]);

    const encryptedInput = await fhevm
      .createEncryptedInput(cusdtAddress, signers.alice.address)
      .add64(stakeAmount)
      .encrypt();

    await (
      await cusdt
        .connect(signers.alice)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
          vaultAddress,
          encryptedInput.handles[0],
          encryptedInput.inputProof,
          data,
        )
    ).wait();

    const [, unlockTime] = await vault.getStake(signers.alice.address);
    await expect(vault.connect(signers.alice).withdraw()).to.be.revertedWithCustomError(vault, "StakeLocked").withArgs(
      unlockTime,
    );
  });

  it("accumulates stakes and extends unlock time", async function () {
    await (await cusdt.mint(signers.alice.address, 1_000)).wait();

    const dataShort = ethers.AbiCoder.defaultAbiCoder().encode(["uint64"], [100]);
    const dataLong = ethers.AbiCoder.defaultAbiCoder().encode(["uint64"], [200]);

    const encryptedA = await fhevm.createEncryptedInput(cusdtAddress, signers.alice.address).add64(100).encrypt();
    await (
      await cusdt
        .connect(signers.alice)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
          vaultAddress,
          encryptedA.handles[0],
          encryptedA.inputProof,
          dataShort,
        )
    ).wait();

    const encryptedB = await fhevm.createEncryptedInput(cusdtAddress, signers.alice.address).add64(50).encrypt();
    await (
      await cusdt
        .connect(signers.alice)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
          vaultAddress,
          encryptedB.handles[0],
          encryptedB.inputProof,
          dataLong,
        )
    ).wait();

    const [encryptedStaked, unlockTime] = await vault.getStake(signers.alice.address);
    const clearStaked = await decryptEuint64(encryptedStaked, vaultAddress, signers.alice);
    expect(clearStaked).to.eq(150);

    const now = await ethers.provider.getBlock("latest");
    expect(Number(unlockTime)).to.be.greaterThan(Number(now?.timestamp));
  });
});

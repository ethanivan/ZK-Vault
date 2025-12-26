import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:zkvault:addresses", "Prints the cUSDT and ZKVault addresses").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;

    const cusdt = await deployments.get("ConfidentialUSDT");
    const vault = await deployments.get("ZKVault");

    console.log(`cUSDT : ${cusdt.address}`);
    console.log(`Vault : ${vault.address}`);
  },
);

task("task:zkvault:mint", "Mints plaintext cUSDT to an address (demo-only)")
  .addParam("to", "Receiver address")
  .addParam("amount", "Cleartext amount (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const to = taskArguments.to as string;
    const amount = BigInt(taskArguments.amount);

    const cusdt = await deployments.get("ConfidentialUSDT");
    const [signer] = await ethers.getSigners();

    const token = await ethers.getContractAt("ConfidentialUSDT", cusdt.address);
    const tx = await token.connect(signer).mint(to, amount);
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();
    console.log(`Minted ${amount.toString()} cUSDT to ${to}`);
  });

task("task:zkvault:stake", "Stake cUSDT via confidentialTransferAndCall")
  .addParam("amount", "Cleartext amount (uint64)")
  .addParam("lock", "Lock duration in seconds (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const amount = Number(taskArguments.amount);
    if (!Number.isInteger(amount) || amount < 0) throw new Error("--amount must be a non-negative integer");

    const lock = BigInt(taskArguments.lock);

    const cusdt = await deployments.get("ConfidentialUSDT");
    const vault = await deployments.get("ZKVault");

    const [signer] = await ethers.getSigners();

    const token = await ethers.getContractAt("ConfidentialUSDT", cusdt.address);

    const encrypted = await fhevm.createEncryptedInput(cusdt.address, signer.address).add64(amount).encrypt();
    const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint64"], [lock]);

    const tx = await token
      .connect(signer)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](vault.address, encrypted.handles[0], encrypted.inputProof, data);
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();

    console.log(`Staked ${amount} cUSDT for ${lock.toString()} seconds`);
  });

task("task:zkvault:position", "Decrypts your cUSDT balance and vault stake position")
  .setAction(async function (_taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const cusdt = await deployments.get("ConfidentialUSDT");
    const vault = await deployments.get("ZKVault");

    const [signer] = await ethers.getSigners();

    const token = await ethers.getContractAt("ConfidentialUSDT", cusdt.address);
    const vaultContract = await ethers.getContractAt("ZKVault", vault.address);

    const encryptedBal = await token.confidentialBalanceOf(signer.address);
    const clearBal = encryptedBal === ethers.ZeroHash ? 0 : await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBal,
      cusdt.address,
      signer,
    );

    const [encryptedStake, unlockTime, active] = await vaultContract.getStake(signer.address);
    const clearStake = encryptedStake === ethers.ZeroHash ? 0 : await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedStake,
      vault.address,
      signer,
    );

    console.log(`Account     : ${signer.address}`);
    console.log(`cUSDT       : ${clearBal}`);
    console.log(`Staked      : ${clearStake}`);
    console.log(`Active      : ${active}`);
    console.log(`Unlock time : ${unlockTime}`);
  });

task("task:zkvault:withdraw", "Withdraw staked cUSDT after unlock time").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const vault = await deployments.get("ZKVault");
    const [signer] = await ethers.getSigners();

    const vaultContract = await ethers.getContractAt("ZKVault", vault.address);
    const tx = await vaultContract.connect(signer).withdraw();
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();
    console.log(`Withdraw succeeded`);
  },
);

import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export interface ExecutionResult {
  success: boolean;
  output: string;
}

export async function runTestExecutor(relativeTestPath: string): Promise<ExecutionResult> {
  console.log('\n🤖 [Agent 4: Test Executor] Executing test suite...');

  try {
    const { stdout, stderr } = await execPromise(`npx playwright test "${relativeTestPath}"`);
    console.log('✅ Test Execution Passed!');
    return { success: true, output: stdout || stderr };
  } catch (err: any) {
    console.log('⚠️ Test Execution failed or reported assertion issues.');
    return { success: false, output: err.stdout || err.stderr || err.message };
  }
}
import { ProcessManager, ProcessConfig } from '../core/processManager';
import { QuarkdownCommandBuilder } from '../core/commandBuilder';
import { Logger, NoOpLogger } from '../core/logger';

/**
 * Configuration for PDF export operation.
 */
export interface PdfExportConfig {
    /** Path to the Quarkdown executable */
    executablePath: string;
    /** Path to the source .qd file */
    filePath: string;
    /** Output directory for the PDF */
    outputDirectory: string;
    /** Logger for operation tracking */
    logger?: Logger;
}

/**
 * Events that can occur during PDF export.
 */
export interface PdfExportEvents {
    /** Called when the export process outputs to stdout */
    onProgress?: (data: string) => void;
    /** Called when the export succeeds */
    onSuccess?: () => void;
    /** Called when the export fails */
    onError?: (error: string) => void;
}

/**
 * Pure PDF export service without VS Code dependencies.
 * Handles the compilation of Quarkdown files to PDF format.
 */
export class PdfExportService {
    private readonly processManager: ProcessManager;
    private readonly logger: Logger;

    constructor() {
        this.processManager = new ProcessManager();
        this.logger = new NoOpLogger();
    }

    /**
     * Export a Quarkdown file to PDF.
     * 
     * @param config Export configuration
     * @param events Event handlers for progress tracking
     * @returns Promise that resolves when export completes
     */
    public async exportToPdf(config: PdfExportConfig, events?: PdfExportEvents): Promise<void> {
        const logger = config.logger || this.logger;

        const command = QuarkdownCommandBuilder.buildPdfExportCommand(
            config.executablePath,
            config.filePath,
            config.outputDirectory
        );

        logger.info(`Starting PDF export: ${command.command} ${command.args.join(' ')}`);

        let stderrBuffer = '';

        const processConfig: ProcessConfig = {
            command: command.command,
            args: command.args,
            cwd: command.cwd,
            events: {
                onStdout: (data) => {
                    logger.info(data.trim());
                    events?.onProgress?.(data);
                },
                onStderr: (data) => {
                    stderrBuffer += data;
                    logger.warn(data.trim());
                    events?.onProgress?.(data);
                },
                onError: (error) => {
                    const errorMessage = error.code === 'ENOENT'
                        ? 'Quarkdown not found. Please install Quarkdown first.'
                        : error.message;
                    logger.error(`Process error: ${errorMessage}`);
                    events?.onError?.(errorMessage);
                },
                onExit: (code) => {
                    if (code !== 0) {
                        const errorMessage = `PDF export failed with exit code ${code}`;
                        logger.error(errorMessage);
                        events?.onError?.(errorMessage);
                        return;
                    }

                    if (stderrBuffer.trim()) {
                        const errorMessage = `PDF export failed: ${stderrBuffer.trim()}`;
                        logger.error(errorMessage);
                        events?.onError?.(errorMessage);
                    } else {
                        logger.info('PDF export completed successfully');
                        events?.onSuccess?.();
                    }
                }
            }
        };

        try {
            await this.processManager.start(processConfig);

            // Wait for process to complete
            return new Promise<void>((resolve, reject) => {
                const checkComplete = () => {
                    if (!this.processManager.isRunning()) {
                        resolve();
                    } else {
                        setTimeout(checkComplete, 100);
                    }
                };
                checkComplete();
            });

        } catch (error) {
            logger.error(`Failed to start PDF export: ${error}`);
            events?.onError?.(`Failed to start PDF export: ${error}`);
            throw error;
        }
    }

    /**
     * Check if export process is currently running.
     */
    public isExporting(): boolean {
        return this.processManager.isRunning();
    }

    /**
     * Cancel the current export operation.
     */
    public async cancel(): Promise<void> {
        await this.processManager.stop();
    }
}

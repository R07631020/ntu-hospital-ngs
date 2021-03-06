import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Run as RunEntity } from 'src/database/ngs-builder/entities/run.entity';
import { Sample as SampleEntity } from 'src/database/ngs-builder/entities/sample.entity';
import { Segment as SegmentEntity } from 'src/database/ngs-builder/entities/segment.entity';
import { SegmentTag as SegmentTagEntity } from 'src/database/ngs-builder/entities/segmentTag.entity';
import { Disease as DiseaseEntity } from 'src/database/ngs-builder/entities/disease.entity';
import { MutationQC as MutationQCEntity } from 'src/database/ngs-builder/entities/mutationQC.entity';
import { Coverage as CoverageEntity } from 'src/database/ngs-builder/entities/coverage.entity';
import { Repository } from 'typeorm';

import { Sample } from '../models/sample.model';
import { Segment } from '../models/segment.model';
import { SegmentTag } from '../models/segmentTag.model';
import { Disease } from '../models/disease.model';
import { FileStatus } from '../models/file.state.enum';
import * as path from 'path';
import { MutationQC } from '../models/mutationQC.model';
import { Coverage } from '../models/coverage.model';

var cp = require('child_process');
const fs = require('fs');
const csv = require('csv-parser');

@Injectable()
export class NGSService {
	constructor(
		@InjectRepository(RunEntity) private runRepository: Repository<RunEntity>,
		@InjectRepository(SampleEntity) private sampleRepository: Repository<SampleEntity>,
		@InjectRepository(SegmentEntity) private segmentRepository: Repository<SegmentEntity>,
		@InjectRepository(SegmentTagEntity) private segmentTagRepository: Repository<SegmentTagEntity>,
		@InjectRepository(DiseaseEntity) private diseaseRepository: Repository<DiseaseEntity>,
		@InjectRepository(MutationQCEntity) private mutationQCRepository: Repository<MutationQCEntity>,
		@InjectRepository(CoverageEntity) private coverageRepository: Repository<CoverageEntity>,
		private configService: ConfigService
	) {}

	async getAllSegments(): Promise<Segment[]> {
		const segments = await this.segmentRepository.find({ order: { segmentId: 'DESC' } });
		return segments;
	}
	async getAllSamples(): Promise<Sample[]> {
		const samples = await this.sampleRepository.find({ order: { sampleId: 'DESC' } });
		return samples;
	}

	async getAllMutationQC(): Promise<MutationQC[]> {
		const mutationQCs = await this.mutationQCRepository.find();
		return mutationQCs;
	}

	async getAllCoverage(): Promise<Coverage[]> {
		const coverages = await this.coverageRepository.find();
		return coverages;
	}

	async getFilterlist(): Promise<SegmentTag[]> {
		const segmentTags = await this.segmentTagRepository.find();
		const segmentTagsModel = segmentTags.map((segmentTag) => {
			let temp = Object.assign(new SegmentTag(), segmentTag);
			temp.id = `${segmentTag.chr}_${segmentTag.position}_${segmentTag.HGVSc}_${segmentTag.HGVSp}`;
			return temp;
		});

		return segmentTagsModel;
	}

	async deleteBlacklist(deleteSegmentTags: SegmentTag[]): Promise<SegmentTag[]> {
		const blacklist = await this.segmentTagRepository.remove(deleteSegmentTags);
		const segmentTagsModel = blacklist.map((segmentTag) => {
			let temp = Object.assign(new SegmentTag(), segmentTag);
			temp.id = `${segmentTag.chr}_${segmentTag.position}_${segmentTag.HGVSc}_${segmentTag.HGVSp}`;
			return temp;
		});
		return segmentTagsModel;
	}
	async deleteWhitelist(deleteSegmentTags: SegmentTag[]): Promise<SegmentTag[]> {
		const whitelist = await this.segmentTagRepository.remove(deleteSegmentTags);
		const segmentTagsModel = whitelist.map((segmentTag) => {
			let temp = Object.assign(new SegmentTag(), segmentTag);
			temp.id = `${segmentTag.chr}_${segmentTag.position}_${segmentTag.HGVSc}_${segmentTag.HGVSp}`;
			return temp;
		});
		return segmentTagsModel;
	}

	async addBlacklist(addSegmentTags: SegmentTag[]): Promise<SegmentTag[]> {
		const blacklist = await this.segmentTagRepository.save(addSegmentTags);
		return blacklist;
	}
	async addWhitelist(addSegmentTags: SegmentTag[]): Promise<SegmentTag[]> {
		const whitelist = await this.segmentTagRepository.save(addSegmentTags);
		return whitelist;
	}

	async getFilelist(): Promise<{}> {
		const aligned = fs
			.readdirSync(this.configService.get<string>('ngs.path'))
			.filter((align: string) => align.match(/Aligned.csv/));
		const bams = fs
			.readdirSync(this.configService.get<string>('ngs.path'))
			.filter((bam: string) => bam.match(/(\d)*_(\w)*.bam/))
			.map((file: string) => `${file.split('.')[0]}`);
		const annotations = fs
			.readdirSync(this.configService.get<string>('ngs.path'))
			.filter((annotation: string) => annotation.match(/(\d)*_(\w)*_Annotation.csv/))
			.map((file: string) => `${file.split('_')[0]}_${file.split('_')[1]}`);
		const files = fs
			.readdirSync(this.configService.get<string>('ngs.path'))
			.filter((file: string) => file.match(/(\d)*_(\w)*_L001_R(1|2)_001.fastq.gz/))
			.map((file: string) => `${file.split('_')[0]}_${file.split('_')[1]}`)
			.filter((element, index, arr) => arr.indexOf(element) !== index);
		const diseases = await this.diseaseRepository.find();
		const unknown = diseases.find((disease) => disease.diseaseId === 1);

		const response = files.map((file) => {
			let disease = file.split('_')[1];
			if (disease.match(/S(\d)*/)) {
				disease = unknown;
			} else {
				disease = diseases.find((d) => d.abbr === disease);
				if (disease === undefined) {
					disease = unknown;
				}
			}

			if (annotations.includes(file)) {
				return { status: FileStatus.Analysing, name: file, disease: disease };
			} else if (bams.includes(file)) {
				return { status: FileStatus.Analysed, name: file, disease: disease };
			} else {
				return { status: FileStatus.NotAnalyse, name: file, disease: disease };
			}
		});
		return { analysis: aligned.length, files: response };
	}


	updateFile(oldSampleName, newSampleName): Promise<void> {
		const oldFileR1 = `${oldSampleName}_L001_R1_001.fastq.gz`;
		const oldFileR2 = `${oldSampleName}_L001_R2_001.fastq.gz`;
		const newFileR1 = `${newSampleName}_L001_R1_001.fastq.gz`;
		const newFileR2 = `${newSampleName}_L001_R2_001.fastq.gz`;
		const pathToFileR1 = path.join(this.configService.get<string>('ngs.path'), oldFileR1);
		const pathToFileR2 = path.join(this.configService.get<string>('ngs.path'), oldFileR2);
		const newPathToFileR1 = path.join(this.configService.get<string>('ngs.path'), newFileR1);
		const newPathToFileR2 = path.join(this.configService.get<string>('ngs.path'), newFileR2);
		try {
			fs.renameSync(pathToFileR1, newPathToFileR1);
			fs.renameSync(pathToFileR2, newPathToFileR2);
		} catch (err) {
			throw err;
		}
		return;
	}

	async getDiseases(): Promise<Array<Disease>> {
		const diseases = await this.diseaseRepository.find();
		return diseases;
	}

	async addDisease(disease: Disease): Promise<void> {
		const response = await this.diseaseRepository.save(disease);
		return;
	}

	async deleteDisease(diseases: Disease[]): Promise<void> {
		const disease = await this.diseaseRepository.findOne({diseaseId:1});
		diseases.forEach(async (d)=>{
			const sampleResponse = await this.sampleRepository.update({disease: d},{disease: disease})
		})
		const response = await this.diseaseRepository.remove(diseases);
		return;
	}

	getResultList(): Promise<Array<string>> {

		const files = fs
			.readdirSync(this.configService.get<string>('ngs.path'))
			.filter((file: string) => file.match(/(\d)*-(\d)*-(\d)*-(\d)*/));

		return files;
	}

	async uploadResult(folder: string): Promise<void> {
		const files = fs
			.readdirSync(`${this.configService.get<string>('ngs.path')}/${folder}/FASTQ`)
			.filter((file: string) => file.match(/(\d)*_S(\d)*_L001_R1_001.fastq.gz/))
			.map((file: string) => `${file.split('_')[0]}_${file.split('_')[1]}`)
			.filter((element, index, arr) => arr.indexOf(element) === index);
		const runResults = {
			runName: folder
		};
		const runsResponse = await this.runRepository.save(runResults);
		console.log(runsResponse);
		const diseases = await this.diseaseRepository.find();
		const sampleResults = files.map((file) => {
			const temp = new Sample();
			temp.sampleName = `${file.split('_')[0]}_${file.split('_')[1]}`;
			temp.disease = diseases.find(
				(d) => (d.abbr === file.split('_')[1].match(/S(\d)*/) ? 'unknown' : file.split('_')[1])
			);
			temp.run.runId = runsResponse.runId;
			return temp;
		});
		const samplesResponse = await this.sampleRepository.save(sampleResults);
		samplesResponse.forEach((element: Sample, index: number) => {
			const segmentResults = new Array<Segment>();
			const mutationQCResults = new Array<MutationQC>();
			const coverageResults = new Array<Coverage>();
			try {
				const stream = fs
					.createReadStream(
						`${this.configService.get<string>(
							'ngs.path'
						)}/${runsResponse.runName}/${element.sampleName}_Annotation.csv`
					)
					.pipe(csv({ headers: false, skipLines: 1 }))
					.on('data', (data) => {
						console.log(`data: ${element.sampleId} -> `, data['0']);
						let temp = new Segment();
						/*if (
							(data['8'] || ('' as string)).indexOf('stop') !== -1 ||
							(data['8'] || ('' as string)).indexOf('missense') !== -1 ||
							(data['8'] || ('' as string)).indexOf('frameshift') !== -1 ||
							(data['8'] || ('' as string)).indexOf('splice') !== -1
						) {*/
						temp.chr = data['0'] || '';
						temp.position = data['1'] || '';
						temp.dbSNP = data['2'] || '';
						temp.freq = parseFloat((data['5'] || '0%').split('%')[0]);
						temp.depth = parseInt(data['6']);
						temp.annotation = data['8'] || '';
						temp.geneName = data['10'] || '';
						temp.HGVSc = data['12'] || '';
						temp.HGVSp = data['13'] || '';
						if ((data['22'] + data['23'] || '').indexOf('Pathogenic') !== -1) {
							temp.clinicalSignificance = 'Pathogenic';
						} else if ((data['22'] + data['23'] || '').indexOf('Benign') !== -1) {
							temp.clinicalSignificance = 'Benign';
						} else if ((data['22'] + data['23'] || '').indexOf('uncertain significant') !== -1) {
							temp.clinicalSignificance = 'uncertain significant';
						} else if ((data['22'] + data['23'] || '').indexOf('not_provided') !== -1) {
							temp.clinicalSignificance = 'not_provided';
						} else {
							temp.clinicalSignificance = '';
						}
						if (parseFloat(data['17'])) temp.globalAF = parseFloat(data['17']);
						if (parseFloat(data['18'])) temp.AFRAF = parseFloat(data['18']);
						if (parseFloat(data['19'])) temp.AMRAF = parseFloat(data['19']);
						if (parseFloat(data['20'])) temp.EURAF = parseFloat(data['20']);
						if (parseFloat(data['21'])) temp.ASNAF = parseFloat(data['21']);
						//}
						
						if (temp.freq > 5) {
							temp.sample.sampleId = element.sampleId;
							segmentResults.push(temp);
						} else if (temp.freq >= 3 && temp.clinicalSignificance === 'Pathogenic') {
							temp.sample.sampleId = element.sampleId;
							segmentResults.push(temp);
						}
					})
					.on('end', async () => {
						console.log(`end ${element.sampleName}`);
						const samplesResponse = await this.segmentRepository.save(segmentResults);
					});
					const stream2 = fs
					.createReadStream(
						`${this.configService.get<string>(
							'ngs.path'
						)}/${runsResponse.runName}/${element.sampleName}_Target_SOMATIC_Mutation_QC.csv`
					)
					.pipe(csv({ headers: false }))
					.on('data', (data) => {
						console.log(`data: ${element.sampleId} -> `, data['0']);
						let temp = new MutationQC();
						temp.sample.sampleId = element.sampleId
						temp.geneName = data[0];
						temp.HGVSc = data[1];
						temp.HGVSp = data[2];
						temp.QC = data[5];
						temp.chr = data[4].split(':')[0];
						temp.cosmic = data[3];
						temp.position = data[4].split(':')[1];
						mutationQCResults.push(temp);
					})
					.on('end', async () => {
						const mutationQCResponse = await this.mutationQCRepository.save(mutationQCResults)
					});
					const stream3 = fs
					.createReadStream(
						`${this.configService.get<string>(
							'ngs.path'
						)}/${runsResponse.runName}/${element.sampleName}_coverage.csv`
					)
					.pipe(csv({  headers: false, skipLines: 1  }))
					.on('data', (data) => {
						console.log(`data: ${element.sampleId} -> `, data['0']);
						let temp = new Coverage();
						temp.sample.sampleId = element.sampleId
						temp.amplionName = data[4];
						temp.ampliconStart = data[1];
						temp.ampliconEnd = data[2];
						temp.amplion_mean_coverge = data[3];
						temp.chr = data[0];
						coverageResults.push(temp);
					})
					.on('end', async () => {
						const coverageResponse = await this.coverageRepository.save(coverageResults)
					});
			} catch (error) {
				console.log('error', error);
			}
		});
		return ;
	}
	
	async runScript(): Promise<void> {
		const files = fs
			.readdirSync(this.configService.get<string>('ngs.path'))
			.filter((file: string) => file.match(/(\d)*_(\w)*_L001_R(1|2)_001.fastq.gz/))
			.map((file: string) => `${file.split('_')[0]}_${file.split('_')[1]}`)
			.filter((element, index, arr) => arr.indexOf(element) === index);

		var child = cp.execFile('bash', [ `/home/pindel/Leukemia_analysis_with_large_indels.bash` ], {
			maxBuffer: 1024 * 1024 * 1024 * 5
		});

		child.on('close', async (code) => {
			const now = new Date(Date.now());
			const runResults = {
				runName: `${now.getFullYear()}-${('0' + (now.getMonth() + 1)).slice(-2)}-${('0' + now.getDate()).slice(
					-2
				)}-${('0' + now.getHours()).slice(-2)}`
			};
			const runsResponse = await this.runRepository.save(runResults);

			const sampleResults = files.map((file) => {
				const temp = new Sample();
				temp.sampleName = `${file.split('_')[0]}_${file.split('_')[1]}`;
				temp.disease = file.split('_')[1].match(/S(\d)*/) ? 'unknown' : file.split('_')[1];
				temp.run.runId = runsResponse.runId;
				return temp;
			});
			const samplesResponse = await this.sampleRepository.save(sampleResults);
			samplesResponse.forEach((element: Sample, index: number) => {
				const segmentResults = new Array<Segment>();
				const mutationQCResults = new Array<MutationQC>();
				const coverageResults = new Array<Coverage>();
				try {
					const stream = fs
						.createReadStream(
							`${this.configService.get<string>(
								'ngs.path'
							)}/${runsResponse.runName}/${element.sampleName}_Annotation.csv`
						)
						.pipe(csv({ headers: false, skipLines: 1 }))
						.on('data', (data) => {
							let temp = new Segment();
							/*if (
								(data['8'] || ('' as string)).indexOf('stop') !== -1 ||
								(data['8'] || ('' as string)).indexOf('missense') !== -1 ||
								(data['8'] || ('' as string)).indexOf('frameshift') !== -1 ||
								(data['8'] || ('' as string)).indexOf('splice') !== -1
							) {*/
							temp.chr = data['0'] || '';
							temp.position = data['1'] || '';
							temp.dbSNP = data['2'] || '';
							temp.freq = parseFloat((data['5'] || '0%').split('%')[0]);
							temp.depth = parseInt(data['6']);
							temp.annotation = data['8'] || '';
							temp.geneName = data['10'] || '';
							temp.HGVSc = data['12'] || '';
							temp.HGVSp = data['13'] || '';
							if ((data['22'] +" "+ data['23'] || '').indexOf('Pathogenic') !== -1) {
								temp.clinicalSignificance = 'Pathogenic';
							} else if ((data['22'] +" "+ data['23'] || '').indexOf('Benign') !== -1) {
								temp.clinicalSignificance = 'Benign';
							} else if ((data['22'] +" "+ data['23'] || '').indexOf('uncertain significant') !== -1) {
								temp.clinicalSignificance = 'uncertain significant';
							} else if ((data['22'] +" "+ data['23'] || '').indexOf('not_provided') !== -1) {
								temp.clinicalSignificance = 'not_provided';
							} else {
								temp.clinicalSignificance = '';
							}
							if (parseFloat(data['17'])) temp.globalAF = parseFloat(data['17']);
							if (parseFloat(data['18'])) temp.AFRAF = parseFloat(data['18']);
							if (parseFloat(data['19'])) temp.AMRAF = parseFloat(data['19']);
							if (parseFloat(data['20'])) temp.EURAF = parseFloat(data['20']);
							if (parseFloat(data['21'])) temp.ASNAF = parseFloat(data['21']);
							//}
							temp.sample.sampleId = element.sampleId;
							if (temp.freq > 5) {
								temp.sample.sampleId = element.sampleId;
								segmentResults.push(temp);
							} else if (temp.freq >= 3 && temp.clinicalSignificance === 'Pathogenic') {
								temp.sample.sampleId = element.sampleId;
								segmentResults.push(temp);
							}
						})
						.on('end', async () => {
							const samplesResponse = await this.segmentRepository.save(segmentResults);
						});
						const stream2 = fs
					.createReadStream(
						`${this.configService.get<string>(
							'ngs.path'
						)}/${runsResponse.runName}/${element.sampleName}_Target_SOMATIC_Mutation_QC.csv`
					)
					.pipe(csv({ headers: false }))
					.on('data', (data) => {
						let temp = new MutationQC();
						temp.sample.sampleId = element.sampleId
						temp.geneName = data[0];
						temp.HGVSc = data[1];
						temp.HGVSp = data[2];
						temp.QC = data[5];
						temp.chr = data[4].split(':')[0];
						temp.cosmic = data[3];
						temp.position = data[4].split(':')[1];
						mutationQCResults.push(temp);
					})
					.on('end', async () => {
						const mutationQCResponse = await this.mutationQCRepository.save(mutationQCResults)
					});
					const stream3 = fs
					.createReadStream(
						`${this.configService.get<string>(
							'ngs.path'
						)}/${runsResponse.runName}/${element.sampleName}_coverage.csv`
					)
					.pipe(csv({  headers: false, skipLines: 1  }))
					.on('data', (data) => {
						let temp = new Coverage();
						temp.sample.sampleId = element.sampleId
						temp.amplionName = data[4];
						temp.ampliconStart = data[1];
						temp.ampliconEnd = data[2];
						temp.amplion_mean_coverge = data[3];
						temp.chr = data[0];
						coverageResults.push(temp);
					})
					.on('end', async () => {
						const coverageResponse = await this.coverageRepository.save(coverageResults)
					});
				} catch (error) {
					console.log('error', error);
				}
			});
		});
	}

	editSampleDisease(sample: Sample): Promise<void> {
		const response = this.sampleRepository.save(sample);
		return;
	}
}

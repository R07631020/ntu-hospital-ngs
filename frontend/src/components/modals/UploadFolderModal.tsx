import { Button, Checkbox, createStyles, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControl, FormControlLabel, FormGroup, InputLabel, makeStyles, MenuItem, Radio, RadioGroup, Select, TextField, Theme, Typography } from '@material-ui/core';
import { CheckBox } from '@material-ui/icons';
import React, { FunctionComponent, useState, useContext, useEffect } from 'react';
import { ExportDataToCsv } from '../../utils/exportDataToCsv';
import FolderOpenIcon from '@material-ui/icons/FolderOpen';
import axios from 'axios';
import { ApiUrl } from '../../constants/constants';

type UploadFolderModalProps = {
    show: boolean;
	onClose: () => void;
};
const useStyles = makeStyles((theme: Theme) =>
	createStyles({
		root: {
			padding: '2px 4px',
			display: 'flex',
			alignItems: 'center',
			width: 400,
			'& .Mui-focused': {
				color: 'green'
			}
		},
		input: {
			marginLeft: theme.spacing(1),
			flex: 1
		},
		formControl: {
			margin: theme.spacing(1),
			minWidth: 200
		}
    })
);
    


export const UploadFolderModal: FunctionComponent<UploadFolderModalProps> = (props) => {
    const classes = useStyles();
    const [ resultlist, setResultlist ] = useState(Array<string>());
    const [ open, setOpen ] = React.useState(false);
    const [ selectResult, setSelectResult ] = useState<string>('');
    useEffect(() => {
		const getResultlist = async () => {
			try {
				const response = await axios(`${ApiUrl}/api/resultlist`);
				console.log(response.data)
				setResultlist(response.data)
			} catch (error) {
				console.log(error);
			}
		};
		
		getResultlist();
	}, []);
    const handleChange = (event: React.ChangeEvent<{ value: unknown }>) => {
		setSelectResult(event.target.value as string);
	};

	const handleUploadResult = () => {
		const uploadResult = async () => {
			try {
				setOpen(true);
				const response = await axios.post(`${ApiUrl}/api/uploadresult`, {
					data: selectResult
				});
				console.log(response.data)
			} catch (error) {
				console.log(error);
			} finally {
				
				setOpen(false);
				window.location.reload(false);
				
			}
		};
		uploadResult();
	};
	return (
		<Dialog maxWidth="xl" open={props.show} onClose={props.onClose}>
			<DialogTitle>Select upload folder</DialogTitle>
			<DialogContent dividers >
			
				<div className="row justify-content-center">
					<FormControl variant="outlined" className={classes.formControl}>
						<InputLabel id="demo-simple-select-outlined-label">Result Folder</InputLabel>
						<Select
							labelId="demo-simple-select-outlined-label"
							id="demo-simple-select-outlined"
							value={selectResult}
							onChange={handleChange}
							label="Result Folder"
						>
							{resultlist.map((result) => {
								return <MenuItem value={result}>{result}</MenuItem>;
							})}
						</Select>
					</FormControl>
					
				</div>
            </DialogContent>
			<DialogActions>
            <Button
						color="default"
						startIcon={<FolderOpenIcon />}
						onClick={handleUploadResult}
						disabled={resultlist.length <= 0 || selectResult === ''}
					>
						Upload
					</Button>
				<Button onClick={props.onClose} color="primary">
					Cancel
				</Button>
			</DialogActions>
		</Dialog>
	);
};

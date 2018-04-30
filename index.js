const Queue = require('rethinkdb-job-queue')
const app = require('./config')
let axios = require('axios');
let async = require('asyncawait/async');
let await = require('asyncawait/await');
const cxnOptions = app.rethinkdb
var pino = require('pino');

let asi = process.env.asi
let asi_user = process.env.asi_user
let asi_pass = process.env.asi_password

// var mongodb = require('mongodb');
// var elasticsearch = require('elasticsearch');
// var MongoClient = require('mongodb').MongoClient;
// var fs = require('fs');
// var path = require('path');
const _ = require('lodash')

console.log('------------------------------||  Product Sync Worker  ||------------------------------')
const qOptions = app.qOptions
const q = new Queue(cxnOptions, qOptions)


let serviceUrl = 'http://localhost:3030';
let pdmUrl = 'http://api.flowzcluster.tk/pdmnew/pdm'
let asiUrl = 'https://sandbox-productservice.asicentral.com/api/v4/'

// let lookup = 'https://sandbox-productservice.asicentral.com/api/v4/lookup/categorieslist'
let psyncUrl = serviceUrl + '/product-sync'

let lookupData = {};

let lookup = {
	'categories': 'categorieslist',
	'FobPoints': 'fobpoints',
	'imprintMethods': 'imprintmethods',
	'packages': 'packages',
	'ShippingDimension': 'shippingdimension',
	'ShippingWeight': 'shippingweight'
}

async function getAPI(id) {
	let res = await axios.get(psyncUrl + '/' + id).then(resp => {
		return resp.data
	}).catch(err => {
		return {}
	})
	return res;
}

async function getPDMdata(id) {
	let res = await axios.get(pdmUrl, {
		headers: {'vid': id}
	}).then(resp => {
		return resp.data
	}).catch(err => {
		console.log('Error ==> PDM GET :: ')
		return []
	})
	return res;
}

async function asiAuth() {
	let url = asiUrl + 'Login'
	let resp = await axios.post(url, {
		asi: asi,
		username: asi_user,
		password: asi_pass
	}).then(res => {
		// console.log('ASI RESP:::', res.data)
		
		return res.data
	}).catch(err => {
		if (err.response == undefined) {
			console.log('Error ==> ASI AUTH :: Network Error')
		} else {
			console.log('Error ==> ASI AUTH ::', err.response.data)
		}
		return {}
	})
	return resp
}

async function getASIProduct(xid, aToken) {
	let url = asiUrl + 'product/' + xid
	let resp = await axios.get(url, {
		headers: { AuthToken: aToken }
	}).then(res => {
		return res.data
	}).catch(err => {
		if (err.response == undefined) {
			console.log('Error ==> ASI GET PRODUCT  :: Network Error')
		} else {
			console.log('Error ==> ASI GET PRODUCT ::', err.response.data)
		}
		return {}
	})
	return resp	
}

async function postASIProduct(aToken, item) {
	let url = asiUrl + 'product/'
	let resp = await axios.post(url, item, {
		headers: { AuthToken: aToken }
	}).then(res => {
		return res.data
	}).catch(err => {
		if (err.response == undefined) {
			console.log('Error ==> ASI POST PRODUCT :: Network Error')
		} else {
			console.log('Error ==> ASI POST PRODUCT ::', err.response.data)
		}
		return {}
	})
	return resp	
}

function asiProductMap(asi_product, _pdmProduct) {
	try {
	// console.log('.........................................', lookupData)
	let pdmProduct = _.cloneDeep(_pdmProduct)

	// ************ Required Fields
	asi_product.ExternalProductId = pdmProduct.sku;
	asi_product.Name = pdmProduct.product_name;
	
	if (pdmProduct.description != undefined) {
		
		// remove all html tags
		let value = pdmProduct.description.replace(/<[^>]+>/ig, '');
		value = value.replace(/\n/g, ' ');
		value = value.replace("\"", "");
		
		asi_product.Description = value
	} else {
		asi_product.Description = pdmProduct.product_name;
	}


	if (pdmProduct.activeSummary != undefined) {
		if (pdmProduct.activeSummary.length < 130) {
			asi_product.Summary = pdmProduct.activeSummary;
		} else {
			asi_product.Summary = pdmProduct.activeSummary.substring(0, 129);
		}
	}  else {
		asi_product.Summary = pdmProduct.product_name;
	}
	

	if (pdmProduct.categories != undefined) {
		if (lookupData.hasOwnProperty('categories')) {

			// console.log('lookupData.categories', lookupData.categories.length, '\n categories::', JSON.stringify(pdmProduct.categories))
			asi_product.Categories = _.intersectionBy(lookupData.categories, pdmProduct.categories , (item) => {
			    return item.toUpperCase();
			}); 
		}
		// asi_product.Categories = pdmProduct.categories;
	} else {
		asi_product.Categories = [];
	}

	asi_product.PriceType = 'L';
	asi_product.Images = [] // -------------------------------------------- atleast one required
	if (!asi_product.hasOwnProperty('ProductConfigurations')) {
		asi_product.ProductConfigurations = {}
	}
	asi_product.ProductConfigurations.Colors = [] //----------------------- atleast one required
	let ImprintMethods = []; //-------------------------------------------- atleast one required
	// ************ Done Required Fields


	asi_product.AsiProdNo = pdmProduct.sku;
	asi_product.SKU = pdmProduct.sku;
	// if (pdmProduct.linename != undefined && pdmProduct.linename != '') {
	// 	asi_product.LineNames = [pdmProduct.linename];
	// }
	if (pdmProduct.search_keyword != undefined && pdmProduct.search_keyword.length > 0) {
		asi_product.ProductKeywords = pdmProduct.search_keyword
	}
	
	// asi_product.ProductDataSheet = '';
	asi_product.SEOFlag = true;
	asi_product.CanOrderLessThanMinimum = true;
	asi_product.Inventory = {
		InventoryLink: "",
		InventoryStatus: "",
		InventoryQuantity: ""
	};
	// asi_product.Catalogs = [];
	// asi_product.ComplianceCerts = [];
	let FOBPoints = [];
	// asi_product.SafetyWarnings = [];
	let PriceGrids = [];

	let validValue = {
		'CA': 'CANADA',
		'US': 'U.S.A.'
	};

	let sizeUnits = {
		'inches': 'in',
		'millimeter': 'mm',
		'centimeter': 'cm'
	}

	let weightUnits = {
		'gm': 'grams',
		'lbs': 'lbs',
		'kg': 'kg',
		'oz': 'oz'
	}


	// ****************** Set Images
	asi_product.Images.push({
		// ImageURL: pdmProduct.default_image,
		ImageURL: 'https://res.cloudinary.com/flowz/raw/upload/v1525085146/product_images/f9ea80ee-6329-48de-b247-a029e1cd841a/54694-blue_1.jpg',
		Rank: 1,
		IsPrimary: true,
		Configurations: [
			{
				Criteria: 'Product Color',
				Value: [
					pdmProduct.default_color
				]
			}
		]
	})
	let rank = 2;
	if (pdmProduct.hasOwnProperty('pdmProduct')) {
		for (let item of pdmProduct.images) {
			if (item.hasOwnProperty('images')) {
				for (let inneritem of item.images) {
					let exist = _.findIndex(asi_product.Images, {ImageURL: inneritem.web_image});
					if (exist == -1) {
						asi_product.Images.push({
							ImageURL: 'https://res.cloudinary.com/flowz/raw/upload/v1525085146/product_images/f9ea80ee-6329-48de-b247-a029e1cd841a/54694-blue_1.jpg',
							// ImageURL: inneritem.web_image,
							Rank: rank,
							IsPrimary: false,
							Configurations: [
								{
									Criteria: 'Product Color',
									Value: [
										inneritem.color
									]
								}
							]
						})
						rank++;	
					}
				} 
			}
		}
	}

	// ****************** Done Images


	// Set Colors --> ProductConfigurations
	for (let item of pdmProduct.attributes.colors) {
		let exist = _.findIndex(asi_product.ProductConfigurations.Colors, {Alias: item})
		if (exist == -1) {
			asi_product.ProductConfigurations.Colors.push({
				Name: "UNCLASSIFIED/OTHER",
				Alias: item
			})
		}
	}
	// asi_product.ProductConfigurations.Colors = _.uniq(asi_product.ProductConfigurations.Colors, 'Alias');

	// Set ImprintMethods --> ProductConfigurations 
	if (pdmProduct.hasOwnProperty('imprint_data')) {
		for (let item of pdmProduct.imprint_data) {
			let exist = _.findIndex(ImprintMethods, {Alias: item.imprint_method})
			if (exist == -1) {
				ImprintMethods.push({
					Alias: item.imprint_method,
					Type: item.imprint_method
				})
			}
		}
	}
	if (ImprintMethods.length > 0) {
		asi_product.ProductConfigurations.ImprintMethods = ImprintMethods;
		// asi_product.ProductConfigurations.ImprintMethods = _.uniq(ImprintMethods, 'Type')
	} else {
		asi_product.ProductConfigurations.ImprintMethods = [{
			Type: 'UNIMPRINTED',
			Alias: 'UNIMPRINTED'
		}];
	}

	// ************** Set Other Value of ProductConfigurations
	let ImprintColors = {
		Type: 'COLR',
		Values: []
	};
	let Origins = [];
	let Packaging = [];
	let ProductionTime = [];
	// let AdditionalColors = [];
	let ImprintLocation = [];
	let ImprintSize = [];
	let RushTime = {};
	let ShippingEstimates = {
		NumberOfItems: [],
		Weight: []
	};
	let ItemWeight = {
		Values: []
	};
	let Sizes = {
		Dimension: {
			Values: []
		}
	};
	let Shapes = [];

	// Origins
	Origins.push({ Name: validValue[pdmProduct.country] });

	// ImprintColors
	if (pdmProduct.attributes.hasOwnProperty('imprint_color')) {
		for (let item of pdmProduct.attributes.imprint_color) {
			let exist = _.findIndex(ImprintColors.Values, {Name: item})
			if (exist == -1) {
				ImprintColors.Values.push({Name: item})
			}
		}
	}

	
	// Shapes
	if (pdmProduct.attributes.hasOwnProperty('shapes')) {
		for (let item of pdmProduct.attributes.shapes) {
			let exist = _.findIndex(Shapes, {Name: item});
			if (exist == -1) {
				Shapes.push({ Name: item })
			}
		}
	}


	// ImprintSize, ImprintLocation
	if (pdmProduct.hasOwnProperty('imprint_data')) {
		for (let item of pdmProduct.imprint_data) {
			if (item.imprint_area != undefined && item.imprint_area != '') {
				let exist = _.filter(ImprintSize, {Value: item.imprint_area })
				if(exist == undefined || exist.length == 0) {
					ImprintSize.push({ Value: item.imprint_area });
				}
			}
			if (item.imprint_position != undefined && item.imprint_position != '') {
				let arr = item.imprint_position.split('|')
				for (let oitem of arr) {
					let exist = _.findIndex(ImprintLocation, {Value: oitem});
					if (exist == -1) {
						ImprintLocation.push({ Value: oitem})
					}
				}
			}
		}
	}



	// ItemWeight, Sizes, ShippingEstimates, Packaging
	if (pdmProduct.hasOwnProperty('shipping')) {
		for (let item of pdmProduct.shipping) {
			
			// ItemWeight
			let unit = item.product_weight_unit
			if (unit !== '') {
				unit = unit.toLowerCase()
			}
			if (unit != '') {
				let exist = _.filter(ItemWeight.Values, {
					Value: [{
						Value: item.product_weight,
						Unit: unit
					}]
				})
				if (exist == undefined || exist.length == 0) {
					ItemWeight.Values.push({
						Value: [{
							Value: item.product_weight,
							Unit: unit
						}]
					})
				}
			}

			// Sizes
			let SizeValue = []
			if (item.product_size_unit != undefined && item.product_size_unit != '') {
				if (item.product_height != undefined && item.product_height != '') {
					// console.log('Product Height::: ', item.product_size_unit)
					SizeValue.push({
						Attribute: 'Height',
						Value: item.product_height,
						Unit: sizeUnits[item.product_size_unit]
					});
				}
				if (item.product_length != undefined && item.product_length != '') {
					// console.log('Product Length::: ', item.product_size_unit)
					SizeValue.push({
						Attribute: 'Length',
						Value: item.product_length,
						Unit: sizeUnits[item.product_size_unit]
					});
				}
				if (SizeValue.length > 0) {
					let sexist = _.filter(Sizes.Dimension.Values, {
						Value: SizeValue
					})
					if (sexist == undefined || sexist.length == 0) {
						Sizes.Dimension.Values.push({
							Value: SizeValue
						})
					}
				}
			}
			


			if (item.shipping_qty_per_carton != undefined && item.shipping_qty_per_carton != '') {
				let exist = _.filter(ShippingEstimates.NumberOfItems, {
					Value: item.shipping_qty_per_carton,
					Unit: 'per Carton'
				})
				if (exist == undefined || exist.length == 0) {
					ShippingEstimates.NumberOfItems.push({
						Value: item.shipping_qty_per_carton,
						Unit: 'per Carton'
					})
				}
			}

			// if (item.carton_weight != undefined && item.carton_weight != '' && item.carton_weight_unit != undefined && item.carton_weight_unit != '') {
			// 	let exist = _.filter(ShippingEstimates.Weight, {
			// 		Value: item.carton_weight,
			// 		Unit: item.carton_weight_unit
			// 	})
			// 	if (exist == undefined || exist.length == 0) {
			// 		ShippingEstimates.Weight.push({
			// 			Value: item.carton_weight,
			// 			Unit: item.carton_weight_unit
			// 		})
			// 	}
			// }

			for (let item of pdmProduct.features) {
				if (item.key == 'Packaging' || item.key == 'packaging') {
					let exist = _.findIndex(Packaging, { Name: item.value});
					if (exist == -1) {
						Packaging.push({
							Name: item.value
						})
					}
				}
			}
		}
	}
	// *************  Done ProductConfigurations 


	// *********** Set FOBPoints
	if (pdmProduct.hasOwnProperty('shipping')) {
		for (let item of pdmProduct.shipping) {
			if (item.fob_state_code != undefined && item.fob_state_code != '' && item.fob_zip_code != undefined && item.fob_zip_code != '' && item.fob_country_code != undefined && item.fob_country_code != '') {
				let exist = _.findIndex(FOBPoints, {Name: item.fob_city + ', ' + item.fob_state_code + ' ' + item.fob_zip_code + ' ' + validValue[item.fob_country_code]});
				if (exist == -1) {
					FOBPoints.push({
						Name: item.fob_city + ', ' + item.fob_state_code + ' ' + item.fob_zip_code + ' ' + validValue[item.fob_country_code] 
					})
				}
			} else {
				let value = item.free_on_board;
				if (value != '') {
					let arr = value.split(' ');
					for (let i of arr) {
						for (let k of validValue) {
							if (i == k) {
								arr[i] = validValue[k];
							}
						}
					} 
					value = arr.join(' ')
				} 
				let exist = _.findIndex(FOBPoints, { Name: item.fob_city + ', ' + value });
				if (exist == -1) {
					FOBPoints.push({
						Name: item.fob_city + ', ' + value 
					})
				}
			}
		}
	}
	// *********** Done Set FOBPoints


	// ******** Set PriceGrids 
	// --> Base Price -> true
	let tSeq = 1;
	if (pdmProduct.hasOwnProperty('pricing')) {
		for (let item of pdmProduct.pricing) {
			if (item.global_price_type == 'global' && item.type == 'decorative' && item.price_type == 'regular') {
				let _prices = []
				for (let [inx, inneritem] of item.price_range.entries()) {
					_prices.push({
						Sequence: inx + 1,
						Qty: inneritem.qty.gte,
						ListPrice: inneritem.price,
						DiscountCode: inneritem.code,
						PriceUnit: {
							ItemsPerUnit: 1
						}
					})
				}
				PriceGrids.push({
					IsBasePrice: true,
					IsQUR: false,
					Description: "N/A",
					Sequence: tSeq,
					Currency: item.currency,
					Prices: _prices
				})
				tSeq++;
			}
		}
	}

	 // --> Base Price -> false
	let fSeq = 1;
	if (pdmProduct.hasOwnProperty('imprint_data')) {
		for (let item of pdmProduct.imprint_data) {
			let charges = [
				'setup_charge', 'additional_location_charge', 'additional_color_charge', 'rush_charge', 'ltm_charge', 'pms_charge'
			]
			let validUpchargeType = {
				additional_color_charge: 'Add. Color Charge',
				additional_location_charge: 'Add. Location Charge',
				setup_charge: 'Set-up Charge',
				rush_charge: 'Rush Service Charge',
				ltm_charge: 'Less than Minimum Charge',
				pms_charge: 'PMS Matching Charge'
			};
			
			for (let charge in validUpchargeType) {
				if( item[charge] !== undefined && item[charge] !== '') {
					let cvalue = item[charge].split('(');
					let cunit = ''
					if (cvalue[1] !== undefined && cvalue[1] !== '') {
						cunit = cvalue[1].replace(')', '');
						cunit = cunit.trim();
					}
					PriceGrids.push({
						IsBasePrice: false,
						IsQUR: false,
						Description: item.imprint_method,
						Sequence: fSeq,
						Currency: pdmProduct.currency,
						ServiceCharge: "Required",
						UpchargeType: validUpchargeType[charge],
						UpchargeUsageType: "Other",
						Prices: [
							{
								PriceUnit: {
									ItemsPerUnit: 1
								},
								Qty: 1,
								ListPrice: cvalue[0],
								DiscountCode: cunit,
								Sequence: 1
							}
						],
						PriceConfigurations: [
							{
								Criteria: "Imprint Method",
								Value: [
									item.imprint_method
								]
							}
						]
					})
					fSeq++;
				}
			}
		}
	}
	// ******** Done PriceGrids


	if (ImprintColors.Values.length > 0) {
		asi_product.ProductConfigurations.ImprintColors = ImprintColors;
	} 
	if (Shapes.length > 0) {
		asi_product.ProductConfigurations.Shapes = Shapes;
	}
	if (ImprintSize.length > 0) {
		asi_product.ProductConfigurations.ImprintSize = ImprintSize;
	}
	if (ImprintLocation.length > 0) {
		asi_product.ProductConfigurations.ImprintLocation = ImprintLocation;
	}
	if (Origins.length > 0) {
		asi_product.ProductConfigurations.Origins = Origins;
	}
	if (ItemWeight.Values.length > 0) {
		asi_product.ProductConfigurations.ItemWeight = ItemWeight;
	}
	if (Sizes.Dimension.Values.length > 0) {
		asi_product.ProductConfigurations.Sizes = Sizes;
	}
	if (ShippingEstimates.NumberOfItems.length > 0) {
		ShippingEstimates.NumberOfItems = ShippingEstimates.NumberOfItems;
	} else {
		delete ShippingEstimates.NumberOfItems
	}
	if (ShippingEstimates.Weight.length > 0) {
		ShippingEstimates.Weight = ShippingEstimates.Weight;
	} else {
		delete ShippingEstimates.Weight
	}
	if (Object.keys(ShippingEstimates).length > 0) {
		asi_product.ProductConfigurations.ShippingEstimates = ShippingEstimates;
	}
	if (Packaging.length > 0) {
		asi_product.ProductConfigurations.Packaging = Packaging;
	}



	if (FOBPoints.length > 0) {
		if (lookupData.hasOwnProperty('FobPoints')) {
			let chekLookup = _.map(FOBPoints, (item) => {
				return item.Name
			})
			let FOB_done = _.intersectionBy(lookupData['FobPoints'], chekLookup, (item1) => {
				return item1.toLowerCase();
			})
			if (FOB_done.length > 0) {
				FOBPoints = _map(FOB_done, (i) => {
					return { Name: i };
				})
				asi_product.FOBPoints = FOBPoints;
			}
		}
	}
	if (PriceGrids.length > 0) {
		asi_product.PriceGrids = PriceGrids;
	}

	console.log('...................Map Done...................')
	return asi_product

	} catch (e) {
		console.log('Error mapFunction :::::::::::::::::', e)
	}
}

async function syncAsiFunction(vid) {
	console.log('*******************  ASI SYNC STARTED  *******************')
	let pdmData = await getPDMdata(vid)
	// console.log('\n', pdmData)

	let asiauth = await asiAuth()
	if (Object.keys(asiauth).length > 0) {
		// console.log('ASI AUTH RESP::: ', asiauth)
		let aToken = asiauth.AccessToken
		for (let k in lookup) {
			lookupData[k] = await axios.get(asiUrl + 'lookup/' + lookup[k], {headers: {
				AuthToken: aToken
			}}).then(res => {
				return res.data[k]
			}).catch(err => {
				console.log('Error ==> Look-up Data Set error. ::', k)
				return []
			})
		}
		// console.log('??????????????????????', lookupData)
		let a = 0;
		if (pdmData.hasOwnProperty('hits')) {
			for (let item of pdmData.hits.hits) {
				// check item exist in ASI or not
				let xid = item._source.sku
				let asi_product = await getASIProduct(xid, aToken)
				if (Object.keys(asi_product).length > 0) {
					// Product Found --> Update Product to ASI

					// if (a < 1) {
						let map_product = await asiProductMap(asi_product, item._source)
						// a++;
						// console.log('\nmap_product >>>>>>>>>>>>>>>>>>> Update \n')
						console.log('map_product >>>>>>>>>>>>>>>>>>> Update :: ',  map_product.SKU);

						let update_product = await postASIProduct(aToken, map_product)
						console.log('%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%', update_product, '\n UPDATE:: ', JSON.stringify(map_product) + '\n')
						// console.log('%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% Update', update_product)
					// } 
				} else {
					// Product Not Found --> Post New Product to ASI

					let map_product = await asiProductMap({}, item._source)
					// console.log('\nmap_product >>>>>>>>>>>>>>>>>>> New \n')
					console.log('map_product >>>>>>>>>>>>>>>>>>> New :: ', map_product.SKU)
					let update_product = await postASIProduct(aToken, map_product)
					// console.log('+++++++++++++++++++++++++++++++++ New', update_product)
					console.log('+++++++++++++++++++++++++++++++++', update_product, '\n DATA::', JSON.stringify(map_product) + '\n')
				}
			}
		}
	}
	return 0;
}

async function syncSageFunction(vid) {
	console.log('*******************  SAGE SYNC STARTED  *******************')
	return 0;
}

q.process(async(job, next) => {
	try {
		console.log('job.data --> Sync_id :: ', job.data.Sync_id, '  Vid :: ', job.data.userdetails.vid)
		let getAPIdata = await getAPI(job.data.Sync_id)
		// console.log('getAPIdata :: ', getAPIdata)
		if (Object.keys(getAPIdata).length > 0) {
			if (getAPIdata.syncOn == 'ASI') {
				syncAsiFunction(job.data.userdetails.vid)
			} else if (getAPIdata.syncOn == 'SAGE') {
				syncSageFunction(job.data.userdetails.vid)
			}
		}
		// console.log('-----------------------||  Done  ||------------------------')
		return next(null, 'success')
	} catch (err) {
		console.log('Error >>>>>>', err)
		pino().error(new Error('... error in process'))
		return next(new Error('error'))
	}
})
q.on('terminated', (queueId, jobId) => {
})
q.on('completed', (queueId, jobId, isRepeating) => {
})
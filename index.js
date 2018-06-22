const Queue = require('rethinkdb-job-queue')
const app = require('./config')
let axios = require('axios');
let async = require('asyncawait/async');
let await = require('asyncawait/await');
const cxnOptions = app.rethinkdb
var pino = require('pino');
var parser = require('xml2json');
let moment = require('moment')
moment().format()

let asi = process.env.asi
let asi_user = process.env.asi_user
let asi_pass = process.env.asi_password
let sageAccId = process.env.sageAccId
let sageLoginId = process.env.sageLoginId
let sagePwd = process.env.sagePwd
// let uploaderService = process.env.uploaderService
let domainKey = process.env.domainKey
// var mongodb = require('mongodb');
// var elasticsearch = require('elasticsearch');
// var MongoClient = require('mongodb').MongoClient;
// var fs = require('fs');
// var path = require('path');
const _ = require('lodash')

console.log('------------------------------||  Product Sync Worker  ||------------------------------')
const qOptions = app.qOptions
const q = new Queue(cxnOptions, qOptions)


// let uploaderServices = 'http://localhost:3040';
let pdmUrl = 'http://api.'+ domainKey +'/pdmnew/pdm'
let asiUrl = 'https://sandbox-productservice.asicentral.com/api/v4/'
// let asiUrl = 'https://productservice.asicentral.com/api/v4/'
let sageUrl = 'https://www.promoplace.com/ws/ws.dll/XMLDataStream'

// let lookup = 'https://sandbox-productservice.asicentral.com/api/v4/lookup/categorieslist'
let psyncUrl = 'https://api.'+ domainKey + '/uploader/product-sync'
let asconfiguration = 'https://api.'+ domainKey + '/uploader/asconfiguration'
// let asconfigurations = uploaderService + '/asconfiguration'
console.log('asconfiguration', asconfiguration)

const no_image_path = 'https://res.cloudinary.com/flowz/image/upload/v1526652106/builder/gxycflqvc1m23qqknch9.png'

let lookupData = {};

let lookup = {
	'categories': 'categorieslist',
	'FobPoints': 'fobpoints',
	'imprintMethods': 'imprintmethods',
	'packages': 'packages',
	'ShippingDimension': 'shippingdimension',
	'ShippingWeight': 'shippingweight'
}

let count = 0
// let prod_count = 0
let skip = 0

async function getAPI(id) {
	let res = await axios.get(psyncUrl + '/' + id).then(resp => {
		return resp.data
	}).catch(err => {
		console.log('GET SYNC DATA ERROR', err)
		return {}
	})	
	return res;
}

async function getPDMdata(id,skip) {
	let res = await axios.get(pdmUrl + '/?$skip=' + skip , {
		headers: {'vid': id}
	}).then(resp => {
		return resp.data
	}).catch(err => {
		console.log('Error ==> PDM GET :: ',err)
		return []
	})
	return res;
}

async function asiAuth(item) {
	let url = asiUrl + 'Login'
	let resp = await axios.post(url, {
		asi: item.number,
		username: item.user,
		password: item.password
	}).then(res => {
		console.log('ASI RESP:::', res.data)
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

async function convertToJson(xml) {
  var options = {
   object: true,
   reversible: true
  };

  var jsonData = parser.toJson(xml,options);
  // jsonData = JSON.stringify(jsonData)
  return jsonData
}

async function convertToXml(json) {
  var xml = parser.toXml(json);
  return xml
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

async function getSageProduct(spc) {
	let url = sageUrl
	let reqObj = '<?xml version="1.0" encoding="UTF-8"?><XMLDataStreamRequest><Ver>3.2</Ver><Auth><AcctID>' + sageAccId + '</AcctID><LoginID>' + sageLoginId + '</LoginID><Password>' + sagePwd + '</Password></Auth><ProductDetail><SPC>' + spc + '</SPC></ProductDetail></XMLDataStreamRequest>'
	let resp = await axios.post(url, reqObj, {headers: {'content-type': 'application/xml'}}).then(async res => {
		let jsonRes = await convertToJson(res.data)
		if(jsonRes.hasOwnProperty('XMLDataStreamResponse')){
			let innerResponse = jsonRes['XMLDataStreamResponse']
			if(innerResponse.hasOwnProperty('ErrMsg')){
				let errObj = {XMLDataStreamResponse: { Ver: { '$t': '3.2' }, Auth: { AcctID : { '$t': sageAccId }, LoginID : { '$t' : sageLoginId }, Password : { '$t' : sagePwd }}, LegalNote: { '$t': 'USE SUBJECT TO TERMS OF YOUR AGREEMENT.  UNAUTHORIZED USE PROHIBITED.  SUPPLIER INFORMATION IS CONFIDENTIAL.  (C) 2018 QUICK TECHNOLOGIES INC.' },ProductDetail: {}}}
				return errObj
			}
			else if(innerResponse.hasOwnProperty('ProductDetail')){
				jsonRes['XMLDataStreamResponse']['Auth'] = { AcctID : { '$t': sageAccId }, LoginID : { '$t' : sageLoginId }, Password : { '$t' : sagePwd } }
				return jsonRes
			}
		}
		else {
			console.log('no')
		}
	}).catch(err => {
	})
	return resp	
}

async function postASIProduct(aToken, item) {
	let url = asiUrl + 'product/'
	let resp = await axios.post(url, item, {
		headers: { AuthToken: aToken }
	}).then(res => {
		console.log('Success', resp.data)
		return res.data
	}).catch(err => {
		if (err.response == undefined) {
			console.log('Error ==> ASI POST PRODUCT :: Network Error')
			return {Errors: [{'Reason': 'Network Error'}]}
		} else {
			console.log('Error ==> ASI POST PRODUCT ::', err.response.data)
			return err.response.data
		}
	})
	return resp	
}

async function postSageProduct(xmlProduct) {
	let url = sageUrl
	let resp = await axios.post(url, xmlProduct, {headers: {'content-type': 'application/xml'}}).then(async res => {
		let jsonRes = await convertToJson(res.data)
		return jsonRes
	}).catch(err => {
	})
	return resp	
}

async function updateProductProcessed(syncId,prod_count) {
	let response = await axios.patch(psyncUrl + '/' + syncId, {'no-product-process': prod_count}).then(res => {
		return res
	})
	.catch(err => {
		console.log('Update error....', err)
	})
	return response
}

async function asiUpdateStatus(syncId, status) {
	let mdata = {
		asiStatus: 'inprogress'
	}
	if (status !== undefined) {
		mdata.asiStatus = 'completed'
	}
	let response = await axios.patch(psyncUrl + '/' + syncId, mdata).then(res => {
		return true
	})
	.catch(err => {
		return false
		console.log('Update error....', err)
	})
	return response
}

async function asiUpdateTotal(syncId, total) {
	let response = await axios.patch(psyncUrl + '/' + syncId, {'total': total}).then(res => {
		return true
	})
	.catch(err => {
		return false
		console.log('Update error....', err)
	})
	return response
}

async function asiUpdateErrors(syncId, errors) {
	let response = await axios.patch(psyncUrl + '/' + syncId, {'asiError': errors}).then(res => {
		return true
	})
	.catch(err => {
		return false
		console.log('Update error....', err)
	})
	return response
}

async function getAsCongiguration(id) {
	console.log('getAsCongiguration', asconfiguration)
	let response = await axios.get(asconfiguration + '/' + id).then(res => {
		console.log('asconfiguration', res.data)
		return res.data
	})
	.catch(err => {
		console.log('Error getAsCongiguration', err)
		let e = new Error(err)
		return e
	})
	return response
}


function sageProductMap(sageProduct, pdmProduct){
	console.log('&&&&&', sageProduct)
	try {
		let pdmProduct1 = _.cloneDeep(pdmProduct)
		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["SPC"] = {"$t" : ''}
		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["SPC"]["$t"] = pdmProduct1.sku

		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["ProductID"] = {"$t" : ''}
		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["ProductID"]["$t"] = parseInt(pdmProduct1.product_id)

		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["PrName"] = {"$t" : ''}
		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["PrName"]["$t"] = pdmProduct1.product_name.replace(/\u2122|\ufffd/gi, '')

		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["LineName"] = {"$t" : ''}
		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["LineName"]["$t"] = pdmProduct1.linename

		let newDesc = pdmProduct1.description.replace(/\n|\"|&nbsp;|\u2122|\ufffd/g, ' ')

		if(newDesc.length <= 500){
			sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Description"] = {"$t" : ''}
			sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Description"]["$t"] = newDesc	
		}
		else {
			sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Description"] = {"$t" : ''}
			sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Description"]["$t"] = newDesc.substring(0,499)
		}

		let newCategories = _.join(pdmProduct1.categories, ',');

		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Category"] = {"$t" : ''}
		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Category"]["$t"] = newCategories

		let newKeywords = _.join(pdmProduct1.search_keyword, ',');

		if(newKeywords.length <= 200){
			sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Keywords"] = {"$t" : ''}
			sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Keywords"]["$t"] = newKeywords	
		}
		else {
			sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Keywords"] = {"$t" : ''}
			sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Keywords"]["$t"] = newKeywords.substring(0,199)
		}


		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["MadeInCountry"] = {"$t" : ''}
		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["MadeInCountry"]["$t"] = pdmProduct1.country

		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["ExpDate"] = {"$t" : ''}
		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["ExpDate"]["$t"] = moment(pdmProduct1.valid_up_to).format("MM/DD/YY")

		// mapping attribute colors
		if(pdmProduct1.hasOwnProperty('attributes')){
			if(pdmProduct1["attributes"].colors.length > 0){
				let newColors = _.join(pdmProduct1["attributes"].colors, ',');
				if(newColors.length <= 300){
					sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Colors"] = {"$t" : ''}
			        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Colors"]["$t"] = newColors	
				}
				else {
					sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Colors"] = {"$t" : ''}
			        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Colors"]["$t"] = newColors.substring(0,299)
				}
			}
		}

		// mapping imprint data fields
		if(pdmProduct1.hasOwnProperty('imprint_data')){
			// for(let i=0; i < pdmProduct1.imprint_data.length; i++){
				if(pdmProduct1.imprint_data[0].imprint_area.length < 100){
					sageProduct["XMLDataStreamResponse"]["ProductDetail"]["ImprintArea"] = {"$t" : ''}
			        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["ImprintArea"]["$t"] = pdmProduct1.imprint_data[0].imprint_area
				}

		        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Decoration Method"] = {"$t" : ''}
		        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Decoration Method"]["$t"] = pdmProduct1.imprint_data[0].imprint_method

		        if(pdmProduct1.imprint_data[0].production_days !== '' && pdmProduct1.imprint_data[0].production_days !== undefined && pdmProduct1.imprint_data[0].production_unit !== '' && pdmProduct1.imprint_data[0].production_unit !== undefined){
		        	
		        	let prodTime =  pdmProduct1.imprint_data[0].production_days + pdmProduct1.imprint_data[0].production_unit
		        	sageProduct["XMLDataStreamResponse"]["ProductDetail"]["ProdTime"] = {"$t" : ''}
		            sageProduct["XMLDataStreamResponse"]["ProductDetail"]["ProdTime"]["$t"] = prodTime

		        }


		        if(pdmProduct1.imprint_data[0].setup_charge !== '' && pdmProduct1.imprint_data[0].setup_charge !== undefined){
		         let SetupChg = ''
		         let SetupChgCode = ''
		         let setupChgArr = pdmProduct1.imprint_data[0].setup_charge.split('(')
		         SetupChg = setupChgArr[0]
		         SetupChgCode = (setupChgArr[1].split(')'))[0]

		         sageProduct["XMLDataStreamResponse"]["ProductDetail"]["SetupChg"] = {"$t" : ''}
		         sageProduct["XMLDataStreamResponse"]["ProductDetail"]["SetupChg"]["$t"] = SetupChg

		         sageProduct["XMLDataStreamResponse"]["ProductDetail"]["SetupChgCode"] = {"$t" : ''}
		         sageProduct["XMLDataStreamResponse"]["ProductDetail"]["SetupChgCode"]["$t"] = SetupChgCode
		        }

		        if(pdmProduct1.imprint_data[0].additional_color_charge !== '' && pdmProduct1.imprint_data[0].additional_color_charge !== undefined){
		         let AddClrChg = ''
		         let AddClrChgCode = ''
		         let addClrChgArr = pdmProduct1.imprint_data[0].additional_color_charge.split('(')
		         AddClrChg = addClrChgArr[0]
		         AddClrChgCode = (addClrChgArr[1].split(')'))[0]

		         sageProduct["XMLDataStreamResponse"]["ProductDetail"]["AddClrChg"] = {"$t" : ''}
		         sageProduct["XMLDataStreamResponse"]["ProductDetail"]["AddClrChg"]["$t"] = AddClrChg

		         sageProduct["XMLDataStreamResponse"]["ProductDetail"]["AddClrChgCode"] = {"$t" : ''}
		         sageProduct["XMLDataStreamResponse"]["ProductDetail"]["AddClrChgCode"]["$t"] = AddClrChgCode
		        }

		        if(pdmProduct1.imprint_data[0].price_included !== '' && pdmProduct1.imprint_data[0].price_included !== undefined){
		         sageProduct["XMLDataStreamResponse"]["ProductDetail"]["PriceIncludes"] = {"$t" : ''}
		         sageProduct["XMLDataStreamResponse"]["ProductDetail"]["PriceIncludes"]["$t"] = pdmProduct1.imprint_data[0].imprint_position
		        }

			// }
		}

		//mapping shipping data fields
		if(pdmProduct1.hasOwnProperty('shipping')){

				if(pdmProduct1.shipping[0].carton_size_unit === 'inches'){

					if(pdmProduct1.shipping[0].carton_length !== "" && pdmProduct1.shipping[0].carton_length !== undefined){
					    sageProduct["XMLDataStreamResponse"]["ProductDetail"]["CartonL"] = {"$t" : ''}
				        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["CartonL"]["$t"] = parseInt(pdmProduct1.shipping[0].carton_length)	
					}

					if(pdmProduct1.shipping[0].carton_width !== "" && pdmProduct1.shipping[0].carton_width !== undefined){
				        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["CartonW"] = {"$t" : ''}
				        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["CartonW"]["$t"] = parseInt(pdmProduct1.shipping[0].carton_width)	
					}

					if(pdmProduct1.shipping[0].carton_height !== "" && pdmProduct1.shipping[0].carton_height !== undefined){
				        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["CartonH"] = {"$t" : ''}
				        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["CartonH"]["$t"] = parseInt(pdmProduct1.shipping[0].carton_height)	
					}

				}

				if(pdmProduct1.shipping[0].carton_weight_unit === 'LBS'){

					sageProduct["XMLDataStreamResponse"]["ProductDetail"]["WeightPerCarton"] = {"$t" : ''}
			        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["WeightPerCarton"]["$t"] = parseInt(pdmProduct1.shipping[0].carton_weight)

				}
				
				if(pdmProduct1.shipping[0].shipping_qty_per_carton !== "" && pdmProduct1.shipping[0].shipping_qty_per_carton !== undefined){
			        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["UnitsPerCarton"] = {"$t" : ''}
			        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["UnitsPerCarton"]["$t"] = parseInt(pdmProduct1.shipping[0].shipping_qty_per_carton)
				}

		       if(pdmProduct1.shipping[0].fob_country_code.length <= 2){
			        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["ShipPointCountry"] = {"$t" : ''}
			        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["ShipPointCountry"]["$t"] = pdmProduct1.shipping[0].fob_country_code
		       }

		        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["ShipPointZip"] = {"$t" : ''}
		        sageProduct["XMLDataStreamResponse"]["ProductDetail"]["ShipPointZip"]["$t"] = parseInt(pdmProduct1.shipping[0].fob_zip_code)

			// find packaging key in features list
			if(pdmProduct1.hasOwnProperty('features')){
				for(let item in pdmProduct1["features"]){
					if(pdmProduct1["features"][item]["key"] === "Packaging"){
						if(pdmProduct1["features"][item]["value"].length <= 50){
							sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Package"] = {"$t" : ''}
			                sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Package"]["$t"] = pdmProduct1["features"][item]["value"]	
						}
					}
				}
			}
		}

		//mapping pricing data fields
		if(pdmProduct1.hasOwnProperty('pricing')){
			for(let item in pdmProduct1['pricing']){
				let price_code = ''
				if(pdmProduct1['pricing'][item]['price_type'] === 'regular' && pdmProduct1['pricing'][item]['type'] === 'decorative' && pdmProduct1['pricing'][item]['global_price_type'] === 'global'){
					sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Currency"] = {"$t" : ''}
	                sageProduct["XMLDataStreamResponse"]["ProductDetail"]["Currency"]["$t"] = pdmProduct1["pricing"][item]["currency"]

					for(let price_item in pdmProduct1['pricing'][item]['price_range']){
						let indx = parseInt(price_item) + 1
						let qty = 'Qty' + indx
						let price = 'Prc' + indx
						price_code = price_code + pdmProduct1["pricing"][item]["price_range"][price_item]["code"]
						sageProduct["XMLDataStreamResponse"]["ProductDetail"][qty] = {"$t" : ''}
	                	sageProduct["XMLDataStreamResponse"]["ProductDetail"][qty]["$t"] = pdmProduct1["pricing"][item]["price_range"][price_item]["qty"]["gte"]

	                	sageProduct["XMLDataStreamResponse"]["ProductDetail"][price] = {"$t" : ''}
	                	sageProduct["XMLDataStreamResponse"]["ProductDetail"][price]["$t"] = pdmProduct1["pricing"][item]["price_range"][price_item]["price"]
					}

					sageProduct["XMLDataStreamResponse"]["ProductDetail"]["PrCode"] = {"$t" : ''}
                	sageProduct["XMLDataStreamResponse"]["ProductDetail"]["PrCode"]["$t"] = price_code
				}

				// if price_type is piece_wise_price map it with PiecesPerUnit
				if(pdmProduct1['pricing'][item]['price_type'] === 'piece_wise_price' && pdmProduct1['pricing'][item]['type'] === 'decorative' && pdmProduct1['pricing'][item]['global_price_type'] === 'global'){
					for(let price_item in pdmProduct1['pricing'][item]['price_range']){
						let indx1 = parseInt(price_item) + 1
						let qty1 = 'PiecesPerUnit' + indx1
						sageProduct["XMLDataStreamResponse"]["ProductDetail"][qty1] = {"$t" : ''}
	                	sageProduct["XMLDataStreamResponse"]["ProductDetail"][qty1]["$t"] = pdmProduct1["pricing"][item]["price_range"][price_item]["qty"]["gte"]
					}
				}
			}
		}

		// mapping price_1 as base_price with Standard catalog price column 1
		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["CatPrc1"] = {"$t" : ''}
    	sageProduct["XMLDataStreamResponse"]["ProductDetail"]["CatPrc1"]["$t"] = pdmProduct1["price_1"]

    	//mapping image link
    	if(pdmProduct1.hasOwnProperty('images')){
    		let secure_url1 = ''
    		for(let item in pdmProduct1['images']){
    			for(let imgItem in pdmProduct1['images'][item]['images']){
    				if(pdmProduct1['images'][item]['images'][imgItem]['web_image'] === pdmProduct1['default_image']){
    					secure_url1 = pdmProduct1['images'][item]['images'][imgItem]['secure_url']
			    		sageProduct["XMLDataStreamResponse"]["ProductDetail"]["PicLink"] = {"$t" : ''}
				    	sageProduct["XMLDataStreamResponse"]["ProductDetail"]["PicLink"]["$t"] = secure_url1
    				}
    			}
    		}   	 
    	}

		return sageProduct
	}
	catch (e) {
		console.log('Error in SageProductMapping......', e)
	}
}

function asiProductMap(asi_product, _pdmProduct) {
	try {
	// console.log('.........................................', lookupData)
	let pdmProduct = _.cloneDeep(_pdmProduct)

	// ************ Required Fields
	asi_product.ExternalProductId = pdmProduct.sku;

	// remove superscripts and modifier letters 
	if(pdmProduct.product_name != undefined){
		let newProductName = pdmProduct.product_name.replace(/\u2122|\ufffd/gi, '')
	    asi_product.Name = newProductName;
	}
	
	if (pdmProduct.description != undefined) {
		
		// remove all html tags
		let value = pdmProduct.description.replace(/<[^>]+>/ig, '');
		value = value.replace(/\n/g, ' ');
		value = value.replace("\"", "");
		value = value.replace(/&nbsp;/g, ' ');

		
		asi_product.Description = value
	} else {
		asi_product.Description = pdmProduct.product_name;
	}


	if (pdmProduct.activeSummary != undefined) {
		let newActiveSummary = pdmProduct.activeSummary.replace(/\u2122|\ufffd/gi, '')

		if (newActiveSummary.length < 130) {
			asi_product.Summary = newActiveSummary;
		} else {
			asi_product.Summary = newActiveSummary.substring(0, 129);
		}
	}  else {
		let ProductName = pdmProduct.product_name.replace(/\u2122|\ufffd/gi, '')
		asi_product.Summary = ProductName;
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
		let keywordsArr = []

		// check if each keyword should have length less than 30
		for(let item in pdmProduct.search_keyword){
			if(pdmProduct.search_keyword[item].length <= 30){	
				keywordsArr.push(pdmProduct.search_keyword[item])
			}
		}
		if(keywordsArr.length < 30){
			asi_product.ProductKeywords = keywordsArr	
		}
		else if(keywordsArr.length > 30){
			keywordsArr = _.slice(keywordsArr,0,30)
			asi_product.ProductKeywords = keywordsArr	
		}
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
	// asi_product.Images.push({
	// 	// ImageURL: pdmProduct.default_image,
	// 	ImageURL: 'https://res.cloudinary.com/flowz/raw/upload/v1525085146/product_images/f9ea80ee-6329-48de-b247-a029e1cd841a/54694-blue_1.jpg',
	// 	Rank: 1,
	// 	IsPrimary: true,
	// 	Configurations: [
	// 		{
	// 			Criteria: 'Product Color',
	// 			Value: [
	// 				pdmProduct.default_color
	// 			]
	// 		}
	// 	]
	// })
	if (!pdmProduct.hasOwnProperty('images')) {
		asi_product.Images.push({
			ImageURL: no_image_path,
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
	} else {
		let imagename = pdmProduct.default_image;
		let checkArr = [];
		for (let item of pdmProduct.images) {
			for (let inneritem of item.images) {
				let _a = imagename.match('/'+inneritem.web_image+'/g')
				if (_a != null) {
					checkArr.push(inneritem)
				}
			}
		}
		if (checkArr.length > 0) {
			asi_product.Images.push({
				ImageURL: checkArr[0].secure_url,
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
		} else {
			asi_product.Images.push({
				ImageURL: no_image_path,
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
		}
	}

	let rank = 2;
	if (pdmProduct.hasOwnProperty('images')) {
		for (let item of pdmProduct.images) {
			if (item.hasOwnProperty('images')) {
				for (let inneritem of item.images) {
					let exist = _.findIndex(asi_product.Images, {ImageURL: inneritem.web_image});
					if (exist == -1) {
						asi_product.Images.push({
							ImageURL: inneritem.secure_url,
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

					// ItemWeight should be greater than 0.01
					if(item.product_weight > 0.01){
						ItemWeight.Values.push({
							Value: [{
								Value: item.product_weight,
								Unit: unit
							}]
						})	
					}
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
					if(inneritem.code !== null && inneritem.code !== ''){
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

async function syncAsiFunction(skip,data, asiError) {
	console.log('*******************  ASI SYNC STARTED  *******************',skip)
	let pdmData = await getPDMdata(data.vid,skip)
	console.log('\n', pdmData)
	let total_hits = pdmData.hits.total
	let getCredintial = await getAsCongiguration(data.asiConfig).then(resp => {
		return resp
	}).catch(err => {
		return {}
	})
	if (Object.keys(getCredintial).length > 0) {
		let asiauth = await asiAuth(getCredintial)
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
				let updateTotal = await asiUpdateTotal(data.id, total_hits)
				for (let item of pdmData.hits.hits) {
					// check item exist in ASI or not
					// let asiError = []
					let xid = item._source.sku
					let asi_product = await getASIProduct(xid, aToken)
					count ++
					if (Object.keys(asi_product).length > 0) {
						// Product Found --> Update Product to ASI

						// if (a < 1) {
							let map_product = await asiProductMap(asi_product, item._source)
							// a++;
							// console.log('\nmap_product >>>>>>>>>>>>>>>>>>> Update \n')
							console.log('map_product >>>>>>>>>>>>>>>>>>> Update :: ',  map_product.SKU);

							let update_product = await postASIProduct(aToken, map_product)
							// console.log('Update %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%', update_product + '\n')
							if (update_product == '') {
								console.log(' :::::::::::::::::: Success :::::::::::::::::')
							} else {
								asiError.push({
									sku: map_product.SKU,
									error: update_product.Errors
								})
							}

							let updated_counted = await updateProductProcessed(data.id,count)
							// console.log('%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% Update', update_product)
						// } 
					} else {
						// Product Not Found --> Post New Product to ASI

						let map_product = await asiProductMap({}, item._source)
						// console.log('\nmap_product >>>>>>>>>>>>>>>>>>> New \n')
						console.log('map_product >>>>>>>>>>>>>>>>>>> New :: ', map_product.SKU)
						let update_product = await postASIProduct(aToken, map_product)
						// console.log('+++++++++++++++++++++++++++++++++ New', update_product)
						// console.log('New +++++++++++++++++++++++++++++++++', update_product + '\n')
						if (update_product == '') {
							console.log(' :::::::::::::::::: Success :::::::::::::::::')
						} else {
							asiError.push({
								sku: map_product.SKU,
								error: update_product.Errors
							})
						}

						let updated_counted = await updateProductProcessed(data.id,count)
					}

					// count ++
				}

				if(count < total_hits){
					skip = skip + 10
					console.log('calling syncASi for next 10 records.............')
					await syncAsiFunction(skip, data, asiError)
				}
			}
		}
	}
	// console.log('Errors:::', asiError)
	return {status: 'done', error: asiError};
}

async function syncSageFunction(vid,skip,syncId) {
	console.log('*******************  SAGE SYNC STARTED  *******************')
	let pdmData = await getPDMdata(vid,skip)
	console.log('\n', pdmData)
	let total_hits = pdmData.hits.total

	if (pdmData.hasOwnProperty('hits')) {
			for (let item of pdmData.hits.hits) {
				// check item exist in Sage or not
				let spc = item._source.sku
				let sage_product = await getSageProduct(spc)
				count ++
				if (sage_product.hasOwnProperty('XMLDataStreamResponse')) {
					
						let mapProduct = await sageProductMap(sage_product, item._source)

						let xmlProduct = await convertToXml(mapProduct)

						console.log('xmlproduct ======>', xmlProduct)

						// let update_product = await postSageProduct(xmlProduct)
						// console.log('%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% update product %%%%%%%%%%%%%%%%%%%%%%%%%%%', update_product)

						// let updated_counted = await updateProductProcessed(syncId,count)

				// // count ++
			}

		}
			if(count < total_hits){
				skip = skip + 10
				console.log('calling syncSage for next 10 records.............',skip)
				syncSageFunction(vid,skip,syncId)
			}
	}

	return 0;
}

q.process(async(job, next) => {
	try {
		if (job.data.id != undefined) {
		console.log('job.data --> Sync_id :: ', job.data.id, '  Vid :: ', job.data.vid)
		count = 0
		skip = 0
		// let getAPIdata = await getAPI(job.data.id)
		// let getAPIdata = job.data
			console.log('job.data :: ', job.data)
			let updateStatus = await asiUpdateStatus(job.data.id)
			if (Object.keys(job.data).length > 0) {
				if (job.data.syncOn == 'ASI') {
					console.log('--------------------------- ASI ------------------------------')
					let isDone = await syncAsiFunction(skip,job.data, [])
					if (isDone.status == 'done') {
						let updatefinalStatus = await asiUpdateErrors(job.data.id, isDone.error)
						let finalStatus = await asiUpdateStatus(job.data.id, 'done')
					}
					console.log('---------------------------- ASI Done -----------------------------')
				} else if (job.data.syncOn == 'SAGE') {
					console.log('------------------- SAGE --------------------')
					await syncSageFunction(job.data.vid,skip,job.data.id)
				} else {
					console.log('------------------- BOTH --------------------')
					await syncAsiFunction(skip,job.data, [])
					await syncSageFunction(job.data.vid,skip,job.data.id)
				}
			}
		console.log('-----------------------||  Done  ||------------------------')
		}
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
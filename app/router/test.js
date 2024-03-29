const express = require('express')
const router = express.Router()
const TestController = require('../controller/test')

router.get('/a', TestController.showTest)

router.get('/b', TestController.sessionDemo)

router.get('/realEstate/list', TestController.sessionDemo)

module.exports = router

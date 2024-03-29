const PosBase = require("../../base-class/pos-base")
const OrderModal = require("../../../model/h5/order/order")

class OrderInfoService extends PosBase {
  constructor() {
    super()
  }

  // 订单过期时间15分钟
  orderExpireTime = 15 * 60 * 1000

  // 统一处理订单详情源数据获取
  async getOrderDetailHelper (order_num) {
    if (!order_num) {
      throw new Error('获取订单详情必须传入order_num')
    }
    try {
      const resData = await OrderModal.aggregate([
        {
          $lookup: {
            from: 'address',
            localField: 'address_id',
            foreignField: 'id',
            as: 'addressDetail'
          }
        },
        {
          $lookup: {
            from: 'shop',
            localField: 'shop_id',
            foreignField: 'id',
            as: 'shopDetail'
          }
        },
        {
          $unwind: '$addressDetail'
        },
        {
          $unwind: '$shopDetail'
        },
        {
          $match: { order_num }
        },
        {
          $project: {
            _id: 0,
            __v: 0
          }
        },
      ])
      return resData[0]
    } catch (err) {
      throw new Error(err)
    }
  }

  // 更新订单数据
  async updateOrderDetailHelper (order_num, data = {}) {
    if (!order_num) {
      throw new Error('获取订单详情必须传入order_num')
    }
    try {
      return await OrderModal.findOneAndUpdate({ order_num }, data)
    } catch (err) {
      throw new Error(err)
    }
  }

  // 统一收敛不同业务场景对订单字段的更改，避免更改字段散落到各个业务代码中。
  // 支付成功修改更新字段: pay_time, order_status
  // 订单状态 待支付0，已支付（准备货物中，可以考虑去掉）1，已取消2，配送中3，已送达4
  async orderPaySuccessHelper (order_num) {
    if (!order_num) {
      throw new Error('获取订单详情必须传入order_num')
    }
    try {
      return await this.updateOrderDetailHelper(order_num, {
        pay_time: new Date().formatTime('yyyy-MM-dd hh:mm:ss'),
        order_status: 3
      })
    } catch (err) {
      throw new Error(err)
    }
  }

  // 统一处理获取订单列表逻辑
  async getOrderListHelper (searchConf, needComment = false) {
    const { pageNum, pageSize, ...searchObj } = searchConf

    // 处理评论关联查询
    let lookUp = [{
      $lookup: {
        from: 'user',
        localField: 'u_id',
        foreignField: 'u_id',
        as: 'user',
      }
    }, {
      $unwind: '$user'
    }, {
      $lookup: {
        from: 'shop',
        localField: 'shop_id',
        foreignField: 'id',
        as: 'shop',
      }
    }, {
      $unwind: '$shop'
    }]
    if (needComment) {
      lookUp.push({
        $lookup: {
          from: 'comment',
          localField: 'comment_id',
          foreignField: 'id',
          as: 'comment',
        }
      }, {
        $unwind: '$comment'
      }, {
        $addFields: {
          comment_img: '$comment.comment_img',
          comment_msg: '$comment.comment_msg',
          comment_skus: '$comment.comment_skus',
          comment_time: '$comment.comment_time',
          ranks: '$comment.ranks'
        }
      }, {
        $project: {
          comment: 0
        }
      })
    }

    // 返回的分页参数
    const paginationMap = {
      pageNum,
      pageSize,
      total: 0,
      hasNext: null
    }

    try {
      const resData = await OrderModal.aggregate([
        ...lookUp,
        {
          $match: searchObj
        }, {
          $skip: (pageNum - 1) * pageSize
        }, {
          $limit: pageSize
        }, {
          $addFields: {
            user_avatar: '$user.avatar',
            user_name: '$user.username'
          }
        }, {
          $project: {
            _id: 0,
            __v: 0,
            user: 0
          }
        }
      ]).sort({
        create_time: -1
      })
      paginationMap.total = await OrderModal.find(searchObj).count()
      paginationMap.hasNext = (paginationMap.total > pageNum * pageSize)

      return {
        list: resData,
        ...paginationMap
      }
    } catch (err) {
      throw new Error(err)
    }
  }

  // 订单详情
  async getOrderDetail (req, res) {
    const { orderNum } = req.query
    try {
      const data = await this.getOrderDetailHelper(orderNum)

      // 订单15分钟内未支付已取消失效
      if (data === undefined) {
        res.json({
          code: 20005,
          msg: '查无此订单，请重新下单',
          errLog: new Error('查无此订单，请重新下单')
        })
      } else {
        const { create_time, order_status } = data
        if (order_status === 0) {
          // 未支付订单15分钟后过期
          data.order_expire_time = new Date(create_time).getTime() + this.orderExpireTime
        }
        res.json({
          data
        })
      }
    } catch (err) {
      res.json({
        code: 20002,
        msg: err,
        errLog: err
      })
    }
  }

  // 订单列表
  async getOrderList (req, res) {
    const { u_id } = req.session
    const { pageNum = 1, pageSize = 10, type } = req.query

    // 处理查询条件
    const searchObj = {
      u_id,
      pageNum,
      pageSize
    }

    try {
      const data = await this.getOrderListHelper(searchObj)
      res.json({
        data
      })
    } catch (err) {
      res.json({
        code: 20002,
        msg: err,
        errLog: err
      })
    }
  }

  // 取消订单
  async cancelOrder (req, res) {
    const { orderNum } = req.body
    try {
      await this.updateOrderDetailHelper(orderNum, {
        cancel_time: new Date().formatTime('yyyy-MM-dd hh:mm:ss'),
        order_status: 2
      })
      res.json({
        data: {
          orderNum
        },
        msg: '订单取消成功'
      })
    } catch (err) {
      res.json({
        code: 20002,
        msg: err,
        errLog: err
      })
    }
  }

}

module.exports = new OrderInfoService()


const SubscriptionsModel = require("../../models/Subscriptions");

const { sendResponse } = require("../../helpers/utils");

let moduleName =  "Subscriptions";
let lang = "english";
let channel = "web";

module.exports = {
  getAll,
};

async function getAll(request, response) {
  let params = request.query;

  try {
    channel = request.header("channel") ? request.header("channel") : channel;
    lang = request.header("lang") ? request.header("lang") : lang;  
    const model = await SubscriptionsModel;

    let page = params.startAt ? parseInt(params.startAt) : 1;

    let perPage = params.perPage ? parseInt(params.perPage) : 10;

    let sortBy = { createdAt: -1 };

    $aggregate = [
      {
        $lookup: {
          from: "systemUsers",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdByDetails",
        },
      },
      {
        $unwind: {
          path: "$createdByDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    if (params.status) {
      $aggregate.push({
        $match: {
          status: {
            $eq: params.status,
          },
        },
      });
    }

    if (params.keyword) {
      let key = params.keyword;

      $aggregate.push({
        $match: {
          $or: [
            {
              "title": RegExp(key, "i"),
            },
          ],
        },
      });
    }

    let data = await model
      .aggregate([$aggregate])
      .sort(sortBy)
      .skip(perPage * (page - 1))
      .limit(perPage)
      .exec();

    $aggregate.push({
      $count: "total",
    });
    const count = await model.aggregate($aggregate).exec();

    const total = count.length ? count[0].total : 0;
    let respData = {
      subscriptions: data,
      pagination: {
        total: total,
        perPage: perPage,
        current: page,
        first: 1,
        last: total ? Math.ceil(total / perPage) : 1,
        next: page < Math.ceil(total / perPage) ? page + 1 : "",
      },
    };
    return sendResponse(response, moduleName, 200, 1, "Subscriptions fetched", respData);
  } catch (error) {
    console.log("Data retrieval failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  GetCommand,
  QueryCommand,
  type QueryCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import {
  actorKey,
  ddb,
  isRoleItem,
  movieKey,
  parseId,
  tableName,
  toRole,
} from "../shared/db";
import { response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const movieId = parseId(event.pathParameters?.movieID);
  if (movieId === undefined) {
    return response(400, { message: "movieID must be a positive integer" });
  }

  const actorParam = event.queryStringParameters?.actor;
  const actorId = parseId(actorParam);

  if (actorParam != null && actorId === undefined) {
    return response(400, { message: "actor must be a positive integer" });
  }

  try {
    if (actorId !== undefined) {
      const result = await ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: movieKey(movieId),
            SK: actorKey(actorId),
          },
        })
      );

      return response(200, {
        data:
          result.Item && isRoleItem(result.Item)
            ? [toRole(result.Item)]
            : [],
      });
    }

    const roles = [];
    let lastKey;

    do {
      const queryResult: QueryCommandOutput = await ddb.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": movieKey(movieId),
            ":sk": "a#",
          },
          ExclusiveStartKey: lastKey,
        })
      );

      roles.push(...(queryResult.Items ?? []).filter(isRoleItem).map(toRole));
      lastKey = queryResult.LastEvaluatedKey;
    } while (lastKey);

    return response(200, { data: roles });
  } catch (err) {
    console.error("DynamoDB error:", err);
    return response(500, { message: "Internal server error" });
  }
};

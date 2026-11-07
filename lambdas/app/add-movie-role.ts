
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { actorKey, ddb, movieKey, type Role, tableName } from "../shared/db";
import { isResponse, parseJsonObject, response } from "../shared/http";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const body = parseJsonObject(event);
  if (isResponse(body)) return body;

  const { movieId, actorId, roleName, roleDescription } = body;

  if (
    typeof movieId !== "number" ||
    !Number.isSafeInteger(movieId) ||
    movieId <= 0 ||
    typeof actorId !== "number" ||
    !Number.isSafeInteger(actorId) ||
    actorId <= 0
  ) {
    return response(400, {
      message: "movieId and actorId must be positive integers",
    });
  }

  if (
    typeof roleName !== "string" ||
    roleName.trim().length === 0 ||
    typeof roleDescription !== "string" ||
    roleDescription.trim().length === 0
  ) {
    return response(400, {
      message: "roleName and roleDescription must be non-empty strings",
    });
  }

  const role: Role = {
    movieId,
    actorId,
    roleName: roleName.trim(),
    roleDescription: roleDescription.trim(),
  };

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: tableName,
              Key: {
                PK: movieKey(movieId),
                SK: movieKey(movieId),
              },
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            ConditionCheck: {
              TableName: tableName,
              Key: {
                PK: actorKey(actorId),
                SK: actorKey(actorId),
              },
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            Put: {
              TableName: tableName,
              Item: {
                PK: movieKey(movieId),
                SK: actorKey(actorId),
                ...role,
              },
              ConditionExpression:
                "attribute_not_exists(PK) AND attribute_not_exists(SK)",
            },
          },
        ],
      })
    );

    return response(201, {
      message: "Role added",
      data: role,
    });
  } catch (err) {
    if (
      err instanceof Error &&
      err.name === "TransactionCanceledException"
    ) {
      return response(409, {
        message:
          "Unable to add role: movie or actor does not exist, or role already exists",
      });
    }

    console.error("DynamoDB error:", err);

    return response(500, {
      message: "Internal server error",
    });
  }
};

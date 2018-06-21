if [ "$TRAVIS_BRANCH" = "master" ]
then
    {
    echo "call $TRAVIS_BRANCH branch"
    ENV_ID=`curl -u ""$RANCHER_ACCESSKEY_MASTER":"$RANCHER_SECRETKEY_MASTER"" -X GET -H 'Accept: application/json' -H 'Content-Type: application/json' "$RANCHER_URL_MASTER/v2-beta/projects?name=Production" | jq '.data[].id' | tr -d '"'`
    echo $ENV_ID
    USERNAME="$DOCKER_USERNAME_FLOWZ";
    TAG="latest";
    SERVICE_NAME="$SERVICE_NAME_MASTER";
    BACKEND_HOST="$BACKEND_HOST_MASTER";
    RANCHER_ACCESSKEY="$RANCHER_ACCESSKEY_MASTER";
    RANCHER_SECRETKEY="$RANCHER_SECRETKEY_MASTER";
    RANCHER_URL="$RANCHER_URL_MASTER";
    RDB_HOST="$RDB_HOST_MASTER";
    RDB_PORT="$RDB_PORT_MASTER";
    asi="$asi_master";
    asi_user="$asi_user_master";
    asi_password="$asi_password_master";
    sageAccId="$sageAccId_master";
    sageLoginId="$sageLoginId_master";
    sagePwd="$sagePwd_master";
    uploaderService="$uploaderService_master"
  }
elif [ "$TRAVIS_BRANCH" = "develop" ]
then
    {
      echo "call $TRAVIS_BRANCH branch"
      ENV_ID=`curl -u ""$RANCHER_ACCESSKEY_DEVELOP":"$RANCHER_SECRETKEY_DEVELOP"" -X GET -H 'Accept: application/json' -H 'Content-Type: application/json' "$RANCHER_URL_DEVELOP/v2-beta/projects?name=Develop" | jq '.data[].id' | tr -d '"'`
      echo $ENV_ID
      USERNAME="$DOCKER_USERNAME";
      TAG="dev";
      SERVICE_NAME="$SERVICE_NAME_DEVELOP";
      BACKEND_HOST="$BACKEND_HOST_DEVELOP";
      RANCHER_ACCESSKEY="$RANCHER_ACCESSKEY_DEVELOP";
      RANCHER_SECRETKEY="$RANCHER_SECRETKEY_DEVELOP";
      RANCHER_URL="$RANCHER_URL_DEVELOP";
      RDB_HOST="$RDB_HOST_DEVELOP";
      RDB_PORT="$RDB_PORT_DEVELOP";
      asi="$asi_develop";
      asi_user="$asi_user_develop";
      asi_password="$asi_password_develop";
      sageAccId="$sageAccId_develop";
      sageLoginId="$sageLoginId_develop";
      sagePwd="$sagePwd_develop";
      uploaderService="$uploaderService_develop"
  }
elif [ "$TRAVIS_BRANCH" = "staging" ]
then
    {
      echo "call $TRAVIS_BRANCH branch"
      ENV_ID=`curl -u ""$RANCHER_ACCESSKEY_STAGING":"$RANCHER_SECRETKEY_STAGING"" -X GET -H 'Accept: application/json' -H 'Content-Type: application/json' "$RANCHER_URL_STAGING/v2-beta/projects?name=Staging" | jq '.data[].id' | tr -d '"'`
      echo $ENV_ID
      USERNAME="$DOCKER_USERNAME";
      TAG="staging";
      SERVICE_NAME="$SERVICE_NAME_STAGING";
      BACKEND_HOST="$BACKEND_HOST_STAGING";
      RANCHER_ACCESSKEY="$RANCHER_ACCESSKEY_STAGING";
      RANCHER_SECRETKEY="$RANCHER_SECRETKEY_STAGING";
      RANCHER_URL="$RANCHER_URL_STAGING";
      RDB_HOST="$RDB_HOST_STAGING";
      RDB_PORT="$RDB_PORT_STAGING";
      asi="$asi_staging";
      asi_user="$asi_user_staging";
      asi_password="$asi_password_staging";
      sageAccId="$sageAccId_staging";
      sageLoginId="$sageLoginId_staging";
      sagePwd="$sagePwd_staging";
      uploaderService="$uploaderService_staging"
  }
else
  {
      echo "call $TRAVIS_BRANCH branch"
      ENV_ID=`curl -u ""$RANCHER_ACCESSKEY_QA":"$RANCHER_SECRETKEY_QA"" -X GET -H 'Accept: application/json' -H 'Content-Type: application/json' "$RANCHER_URL_QA/v2-beta/projects?name=Develop" | jq '.data[].id' | tr -d '"'`
      echo $ENV_ID
      USERNAME="$DOCKER_USERNAME";
      TAG="qa";
      SERVICE_NAME="$SERVICE_NAME_QA";
      BACKEND_HOST="$BACKEND_HOST_QA";
      RANCHER_ACCESSKEY="$RANCHER_ACCESSKEY_QA";
      RANCHER_SECRETKEY="$RANCHER_SECRETKEY_QA";
      RANCHER_URL="$RANCHER_URL_QA";
      RDB_HOST="$RDB_HOST_QA";
      RDB_PORT="$RDB_PORT_QA";
      asi="$asi_qa";
      asi_user="$asi_user_qa";
      asi_password="$asi_password_qa";
      sageAccId="$sageAccId_qa";
      sageLoginId="$sageLoginId_qa";
      sagePwd="$sagePwd_qa";
      uploaderService="$uploaderService_qa"
  }
fi


SERVICE_ID=`curl -u ""$RANCHER_ACCESSKEY":"$RANCHER_SECRETKEY"" -X GET -H 'Accept: application/json' -H 'Content-Type: application/json' "$RANCHER_URL/v2-beta/projects/$ENV_ID/services?name=$SERVICE_NAME" | jq '.data[].id' | tr -d '"'`
echo $SERVICE_ID


curl -u ""$RANCHER_ACCESSKEY":"$RANCHER_SECRETKEY"" \
-X POST \
-H 'Accept: application/json' \
-H 'Content-Type: application/json' \
-d '{
       "inServiceStrategy":{
           "launchConfig": {
                 "imageUuid":"docker:'$USERNAME'/product-sync-worker:'$TAG'",
                 "kind": "container",
                 "labels":{
                        "io.rancher.container.pull_image": "always",
                        "io.rancher.scheduler.affinity:host_label": "'"$BACKEND_HOST"'"
                      },
                 "environment": {
                      "RDB_HOST": "'"$RDB_HOST"'",
                      "RDB_PORT": "'"$RDB_PORT"'",
                      "asi": "'"$asi"'",
                      "asi_user": "'"$asi_user"'",
                      "asi_password": "'"$asi_password"'",
                      "sageAccId": "'"$sageAccId"'",
                      "sageLoginId": "'"$sageLoginId"'",
                      "sagePwd": "'"$sagePwd"'",
                      "uploaderService": "'"$uploaderService"'"
                    }
                 }
               },
        "toServiceStrategy":null}' \
$RANCHER_URL/v2-beta/projects/$ENV_ID/services/$SERVICE_ID?action=upgrade

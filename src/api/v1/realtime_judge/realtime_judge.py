from fastapi import APIRouter
from fastapi.responses import JSONResponse

valid_hand_shapes = {"Rock", "Paper", "Pointing_UP"}

router = APIRouter(
    prefix="/realtime",
    tags=["v1"],
    responses={404: {"description": "Not found"}},
)

@router.get(
    "/judge",
)
async def get_realtime_judge(hand_shape: str):
    """
    手の形を受け取り、判定結果を返すエンドポイント
    """
    if hand_shape not in valid_hand_shapes:
        return JSONResponse(
            status_code=400,
            content={
                "message": f"Must be Rock, Paper, or Pointing_UP, but got {hand_shape}"
            },
        )

    return JSONResponse(
        status_code=200,
        content={
            "message": f"Received hand shape: {hand_shape}",
            "hand_shape": hand_shape,
        },
    )
